import type { WebRTCSessionConnected } from '../protocol.ts';
import { SteamError } from '../steam/eresult.ts';
import { steamIdFromAccountId } from '../steam/friends.ts';
import type { VoiceConnection } from './connection.ts';
import { Emitter } from './emitter.ts';
import { type Participant, Participants } from './participants.ts';
import { RemoteDescriptions } from './remoteDescriptions.ts';
import {
  CONNECT_TIMEOUT_MS,
  RING_TIMEOUT_MS,
  retryDelay,
  WATCHDOG_INTERVAL_MS,
} from './retryPolicy.ts';
import { mungeOpusFmtp } from './sdp.ts';
import { watchSpeaking } from './speaking.ts';
import { browserInfo, userAgent, waitForIceConnected } from './webrtc.ts';

export type VoiceTarget =
  | { kind: 'group'; groupId: string; chatId: string }
  /** `incomingVoiceChatId` is set when answering a call instead of placing one */
  | { kind: 'friend'; steamid: string; incomingVoiceChatId?: string };

export type VoiceSessionState =
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'reconnecting'
  | 'ended';

interface VoiceSessionEvents {
  state: VoiceSessionState;
  participants: Participant[];
  /** steamids of everyone currently speaking, us included */
  speaking: string[];
  /** our own mute and deafen, as set with `setMicMuted` and `setOutputMuted` */
  muted: { micMuted: boolean; outputMuted: boolean };
  ended: { reason: string };
  log: string;
}

export interface VoiceSessionOptions {
  connection: VoiceConnection;
  selfSteamId: string;
  target: VoiceTarget;
  /** owned by the caller (stop its tracks after the session ends), null joins listen-only */
  microphone: MediaStream | null;
}

// steam's join answers this when it wants the client to retry
const ERESULT_FAIL = 2;

/** Errors that end the session instead of retrying it. */
class FatalVoiceError extends Error {}
/** Thrown by superseded attempts so they stop quietly. */
class StaleAttempt extends Error {}

/**
 * One Steam voice chat (group channel or 1:1 call). Signaling goes through the
 * vaporchat server, media flows directly between this browser and Steam.
 */
export class VoiceSession extends Emitter<VoiceSessionEvents> {
  state: VoiceSessionState = 'connecting';
  voiceChatId: string | null = null;
  readonly target: VoiceTarget;

  #connection: VoiceConnection;
  #selfSteamId: string;
  #microphone: MediaStream | null;
  #pc: RTCPeerConnection | null = null;
  /** sends our microphone, swapping its track keeps the ssrc steam relays */
  #sender: RTCRtpSender | null = null;
  #remote: RemoteDescriptions | null = null;
  #attempt = 0;
  #failures = 0;
  #everConnected = false;
  #partnerAccepted = false;
  #connectingSince = Date.now();
  #onSessionConnected: ((info: WebRTCSessionConnected) => void) | null = null;
  #onPartnerAnswer: ((accepted: boolean) => void) | null = null;
  #participants: Participants;
  /** remote track id → steamid of the participant it carries */
  #trackOwners = new Map<string, string>();
  #speaking: string[] = [];
  #speakingTrackIds: ReadonlySet<string> = new Set();
  #stopSpeaking: (() => void) | null = null;
  #micMuted = false;
  #outputMuted = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #watchdog: ReturnType<typeof setInterval> | null = null;
  #unsubscribers: (() => void)[] = [];

  constructor(options: VoiceSessionOptions) {
    super();
    this.#connection = options.connection;
    this.#selfSteamId = options.selfSteamId;
    this.target = options.target;
    this.#microphone = options.microphone;
    this.#participants = new Participants(options.selfSteamId);
    if (this.target.kind === 'friend' && this.target.incomingVoiceChatId) {
      this.voiceChatId = this.target.incomingVoiceChatId;
    }
  }

  get micMuted() {
    return this.#micMuted;
  }

  get outputMuted() {
    return this.#outputMuted;
  }

  get participants() {
    return this.#participants.list();
  }

  get microphone() {
    return this.#microphone;
  }

  get speaking() {
    return this.#speaking;
  }

  start() {
    this.#subscribe();
    this.#watchdog = setInterval(
      () => this.#checkTimeout(),
      WATCHDOG_INTERVAL_MS,
    );
    void this.#run();
  }

  /** Leaves the voice channel, or hangs up the call for both sides. */
  async leave() {
    if (this.state === 'ended') return;
    const voiceChatId = this.voiceChatId;
    this.#finish('left');
    if (this.target.kind === 'group') {
      await this.#connection.call('ChatRoom.LeaveVoiceChat#1', {
        chat_group_id: this.target.groupId,
        chat_id: this.target.chatId,
      });
    } else if (voiceChatId) {
      await this.#connection.call('VoiceChat.EndOneOnOneChat#1', {
        steamid_partner: this.target.steamid,
      });
    }
  }

  /** Hands the microphone to a session taking over, so ending this one doesn't stop it. */
  detachMicrophone() {
    const microphone = this.#microphone;
    this.#microphone = null;
    return microphone;
  }

  /** Stops locally without telling Steam, use `leave()` to actually leave or hang up. */
  close(reason = 'closed') {
    this.#finish(reason);
  }

  /** Swaps the microphone mid-chat, null continues listen-only. The caller owns both streams. */
  async setMicrophone(microphone: MediaStream | null) {
    if (this.state === 'ended') return;
    const track = microphone?.getAudioTracks()[0] ?? null;
    if (track) track.enabled = !this.#micMuted;
    this.#microphone = microphone;
    if (this.#sender) {
      await this.#sender.replaceTrack(track);
    } else if (track && this.#pc) {
      // joined listen-only: there's no sending m-section to reuse and steam never sees our
      // renegotiations, so rebuild the connection like the official client does
      this.#log('Microphone added to a listen-only chat, reconnecting to send');
      this.#restart(0);
      return;
    }
    this.#sendVoiceStatus();
  }

  setMicMuted(muted: boolean) {
    this.#micMuted = muted;
    for (const track of this.#microphone?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
    this.#onSpeaking(this.#speakingTrackIds);
    this.#sendVoiceStatus();
    this.#emitMuted();
  }

  /** Only announces deafen to others, silencing playback is up to the caller. */
  setOutputMuted(muted: boolean) {
    this.#outputMuted = muted;
    this.#sendVoiceStatus();
    this.#emitMuted();
  }

  #emitMuted() {
    this.emit('muted', {
      micMuted: this.#micMuted,
      outputMuted: this.#outputMuted,
    });
  }

  #log(message: string) {
    this.emit('log', message);
  }

  #setState(state: VoiceSessionState) {
    if (this.state === state || this.state === 'ended') return;
    this.state = state;
    this.emit('state', state);
  }

  #isOurChat(notification: {
    voice_chatid?: string;
    chatid?: string;
    chat_group_id?: string;
  }) {
    if (this.voiceChatId && notification.voice_chatid === this.voiceChatId) {
      return true;
    }
    return (
      this.target.kind === 'group' &&
      notification.chat_group_id === this.target.groupId &&
      notification.chatid === this.target.chatId
    );
  }

  #subscribe() {
    const c = this.#connection;
    this.#unsubscribers.push(
      c.on(
        'WebRTCClientNotifications.NotifyWebRTCSessionConnected#1',
        (info) => {
          this.#onSessionConnected?.(info);
        },
      ),
      c.on(
        'WebRTCClientNotifications.NotifyWebRTCUpdateRemoteDescription#1',
        (update) => this.#remote?.queue(update),
      ),
      c.on('VoiceChatClient.NotifyOneOnOneChatResponse#1', (response) => {
        if (
          this.target.kind === 'friend' &&
          response.voicechat_id === this.voiceChatId &&
          response.steamid_partner === this.target.steamid
        ) {
          this.#onPartnerAnswer?.(response.accepted_request === true);
        }
      }),
      c.on('VoiceChatClient.NotifyUserJoinedVoiceChat#1', (joined) => {
        if (!this.#isOurChat(joined)) return;
        if (this.#participants.add(joined.user_steamid))
          this.#emitParticipants();
      }),
      c.on('VoiceChatClient.NotifyUserLeftVoiceChat#1', (left) => {
        if (!this.#isOurChat(left)) return;
        this.#participants.remove(left.user_steamid);
        this.#emitParticipants();
      }),
      c.on('VoiceChatClient.NotifyUserVoiceStatus#1', (status) => {
        if (!this.#isOurChat(status)) return;
        this.#participants.applyStatus(status);
        this.#emitParticipants();
      }),
      c.on('VoiceChatClient.NotifyAllUsersVoiceStatus#1', (all) => {
        if (!this.#isOurChat(all)) return;
        for (const status of all.users ?? [])
          this.#participants.applyStatus(status);
        this.#emitParticipants();
      }),
      c.on('VoiceChatClient.NotifyVoiceChatEnded#1', (ended) => {
        if (this.#isOurChat(ended)) this.#finish('voice chat ended');
      }),
      c.on('ChatRoomClient.NotifyShouldRejoinChatRoomVoiceChat#1', (rejoin) => {
        if (
          this.target.kind === 'group' &&
          rejoin.chat_group_id === this.target.groupId &&
          rejoin.chat_id === this.target.chatId
        ) {
          this.#log('Steam asked to rejoin the voice channel');
          this.#restart(0);
        }
      }),
      c.on('close', () => this.#finish('lost connection to Steam')),
    );
  }

  #checkTimeout() {
    if (this.state === 'connected' || this.state === 'ended') return;
    const limit =
      this.state === 'ringing' ? RING_TIMEOUT_MS : CONNECT_TIMEOUT_MS;
    if (Date.now() - this.#connectingSince > limit) {
      this.#finish(
        this.state === 'ringing' ? 'no answer' : 'timed out connecting',
      );
      void this.#hangUpUnansweredCall();
    }
  }

  async #hangUpUnansweredCall() {
    if (this.target.kind !== 'friend' || !this.voiceChatId) return;
    await this.#connection.call('VoiceChat.EndOneOnOneChat#1', {
      steamid_partner: this.target.steamid,
    });
  }

  async #run() {
    const attempt = ++this.#attempt;
    try {
      await this.#connect(attempt);
    } catch (err) {
      if (err instanceof StaleAttempt || attempt !== this.#attempt) return;
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof FatalVoiceError) {
        this.#finish(message);
        void this.#hangUpUnansweredCall();
        return;
      }
      this.#log(`Voice connection attempt failed: ${message}`);
      this.#restart(retryDelay(this.#failures++));
    }
  }

  #ensureCurrent(attempt: number) {
    if (attempt !== this.#attempt || this.state === 'ended') {
      throw new StaleAttempt();
    }
  }

  async #connect(attempt: number) {
    const c = this.#connection;
    const target = this.target;

    // the callee accepts before building its peer connection, and again on every retry
    if (target.kind === 'friend' && target.incomingVoiceChatId) {
      await c
        .call('VoiceChat.AnswerOneOnOneChat#1', {
          voice_chatid: target.incomingVoiceChatId,
          steamid_partner: target.steamid,
          accepted_request: true,
        })
        .catch((err: Error) => {
          throw new FatalVoiceError(
            `Could not answer the call: ${err.message}`,
          );
        });
      this.#ensureCurrent(attempt);
    }

    const pc = new RTCPeerConnection();
    this.#pc = pc;
    const micTrack = this.#microphone?.getAudioTracks()[0];
    if (micTrack && this.#microphone) {
      this.#sender = pc.addTrack(micTrack, this.#microphone);
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    const sessionConnected = new Promise<WebRTCSessionConnected>((resolve) => {
      this.#onSessionConnected = resolve;
    });
    const remote = new RemoteDescriptions(pc, {
      onFailure: (err) => {
        if (attempt !== this.#attempt || this.state === 'ended') return;
        this.#log(
          `Applying Steam's updated description failed: ${String(err)}`,
        );
        this.#restart(retryDelay(this.#failures++));
      },
      acknowledge: async (version) => {
        const webrtc = await sessionConnected;
        // the official client ignores the ack result, a failed ack must not tear the call down
        await c
          .call('WebRTCClient.AcknowledgeUpdatedRemoteDescription#1', {
            ip_webrtc_server: webrtc.server_ip,
            port_webrtc_server: webrtc.server_port,
            ip_webrtc_session_client: webrtc.client_ip,
            port_webrtc_session_client: webrtc.client_port,
            remote_description_version: version,
          })
          .catch((err: Error) => {
            this.#log(
              `Steam did not accept ack of v${version}: ${err.message}`,
            );
          });
      },
    });
    this.#remote = remote;
    this.#stopSpeaking = watchSpeaking(pc, (trackIds) =>
      this.#onSpeaking(trackIds),
    );
    pc.addEventListener('track', (event) => this.#onTrack(event));
    pc.addEventListener('iceconnectionstatechange', () => {
      this.#log(`ICE ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed' && attempt === this.#attempt) {
        this.#log('ICE failed, reconnecting');
        this.#restart(retryDelay(this.#failures++));
      }
    });

    const iceConnected = waitForIceConnected(pc);
    // a failing ICE check would otherwise surface as an unhandled rejection before we await it
    iceConnected.catch(() => {});

    const browser = browserInfo();
    const offer = await pc.createOffer();
    const sdp =
      browser.name === 'Firefox'
        ? (offer.sdp ?? '')
        : mungeOpusFmtp(offer.sdp ?? '');
    await pc.setLocalDescription({ type: 'offer', sdp });
    this.#ensureCurrent(attempt);

    const { remote_description } = await c.call(
      'WebRTCClient.InitiateWebRTCConnection#1',
      {
        sdp: JSON.stringify({ type: 'offer', sdp }),
        browser_name: browser.name,
        browser_version: browser.version,
      },
    );
    this.#ensureCurrent(attempt);
    const answer = JSON.parse(remote_description) as RTCSessionDescriptionInit;
    if (answer.type !== 'answer') {
      throw new FatalVoiceError(
        `Steam sent an ${answer.type} instead of an answer`,
      );
    }
    await remote.applyAnswer(answer.sdp ?? '');
    this.#ensureCurrent(attempt);

    // steam only accepts the voice chat binding once both the media path and its session notification are up
    const [webrtc] = await Promise.all([sessionConnected, iceConnected]);
    this.#ensureCurrent(attempt);
    this.#log(`WebRTC session connected, sending ssrc ${webrtc.ssrc}`);

    if (target.kind === 'group') {
      const joined = await c
        .call('ChatRoom.JoinVoiceChat#1', {
          chat_group_id: target.groupId,
          chat_id: target.chatId,
        })
        .catch((err: Error) => {
          if (err instanceof SteamError && err.eresult !== ERESULT_FAIL) {
            throw new FatalVoiceError(`Could not join voice: ${err.message}`);
          }
          throw err;
        });
      this.voiceChatId = joined.voice_chatid;
    } else if (!target.incomingVoiceChatId && !this.#partnerAccepted) {
      await this.#ringPartner(attempt, target.steamid);
    }
    this.#ensureCurrent(attempt);

    await c.call('VoiceChat.UpdateVoiceChatWebRTCData#1', {
      voice_chatid: this.voiceChatId ?? '',
      ip_webrtc_server: webrtc.server_ip,
      port_webrtc_server: webrtc.server_port,
      ip_webrtc_client: webrtc.client_ip,
      port_webrtc_client: webrtc.client_port,
      ssrc_my_sending_stream: webrtc.ssrc,
      user_agent: userAgent(),
      has_audio_worklets_support: typeof AudioWorkletNode !== 'undefined',
      has_webrtc_data_channel: false,
      accepts_webrtc_video: false,
      sends_webrtc_video: false,
    });
    this.#ensureCurrent(attempt);

    this.#failures = 0;
    this.#everConnected = true;
    this.#setState('connected');
    this.#sendVoiceStatus();
  }

  async #ringPartner(attempt: number, partner: string) {
    const answered = new Promise<boolean>((resolve) => {
      this.#onPartnerAnswer = resolve;
    });
    const requested = await this.#connection
      .call('VoiceChat.RequestOneOnOneChat#1', { steamid_partner: partner })
      .catch((err: Error) => {
        throw new FatalVoiceError(`Could not call: ${err.message}`);
      });
    this.#ensureCurrent(attempt);
    this.voiceChatId = requested.voice_chatid;
    this.#setState('ringing');
    this.#connectingSince = Date.now();
    const accepted = await answered;
    this.#onPartnerAnswer = null;
    this.#ensureCurrent(attempt);
    if (!accepted) {
      throw new FatalVoiceError('call declined');
    }
    this.#partnerAccepted = true;
    this.#connectingSince = Date.now();
    this.#setState('connecting');
  }

  #onTrack(event: RTCTrackEvent) {
    const accountId = this.#remote?.accountIdForTrack(event) ?? null;
    if (accountId === null) {
      this.#log(
        `Remote track without a known user (streams ${event.streams.map((s) => s.id).join(', ')})`,
      );
      return;
    }
    const steamid = steamIdFromAccountId(accountId);
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    this.#trackOwners.set(event.track.id, steamid);
    this.#participants.setStream(steamid, stream);
    this.#emitParticipants();

    const removeStream = () => {
      if (this.#participants.clearStream(steamid, stream))
        this.#emitParticipants();
    };
    event.track.addEventListener('ended', removeStream);
    stream.addEventListener('removetrack', () => {
      if (stream.getTracks().length === 0) removeStream();
    });
  }

  #emitParticipants() {
    this.emit('participants', this.participants);
  }

  #onSpeaking(trackIds: ReadonlySet<string>) {
    this.#speakingTrackIds = trackIds;
    const micTrackId = this.#microphone?.getAudioTracks()[0]?.id;
    this.#setSpeaking(
      [...trackIds].flatMap((trackId) => {
        if (trackId === micTrackId) {
          return this.#micMuted ? [] : [this.#selfSteamId];
        }
        return this.#trackOwners.get(trackId) ?? [];
      }),
    );
  }

  #setSpeaking(steamids: string[]) {
    if (steamids.length === 0 && this.#speaking.length === 0) return;
    this.#speaking = steamids;
    this.emit('speaking', steamids);
  }

  #sendVoiceStatus() {
    if (this.state !== 'connected' || !this.voiceChatId) return;
    this.#connection.notify('VoiceChat.NotifyUserVoiceStatus#1', {
      voice_chatid: this.voiceChatId,
      user_steamid: this.#selfSteamId,
      user_muted_mic_locally: this.#micMuted,
      user_muted_output_locally: this.#outputMuted,
      user_has_no_mic_for_session: !this.#microphone?.getAudioTracks().length,
      // steam's relay won't forward a sender that reports no/odd sample rate
      user_webaudio_sample_rate: 48000,
      user_sends_video: false,
    });
  }

  #teardown() {
    this.#attempt++;
    this.#pc?.close();
    this.#pc = null;
    this.#sender = null;
    this.#remote?.close();
    this.#remote = null;
    this.#stopSpeaking?.();
    this.#stopSpeaking = null;
    this.#trackOwners.clear();
    this.#speakingTrackIds = new Set();
    this.#setSpeaking([]);
    this.#onSessionConnected = null;
    this.#onPartnerAnswer = null;
    this.#participants.clearAllStreams();
    this.#emitParticipants();
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  /** Full rebuild: new peer connection, new offer, and for groups a new join. */
  #restart(delayMs: number) {
    if (this.state === 'ended') return;
    this.#teardown();
    // the connect timeout restarts after a drop, but covers all retries of the first connect
    if (this.#everConnected) {
      this.#setState('reconnecting');
      this.#connectingSince = Date.now();
    }
    this.#retryTimer = setTimeout(() => void this.#run(), delayMs);
  }

  #finish(reason: string) {
    if (this.state === 'ended') return;
    this.#teardown();
    if (this.#watchdog) clearInterval(this.#watchdog);
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    this.#log(`Voice session ended: ${reason}`);
    this.#setState('ended');
    this.emit('ended', { reason });
  }
}
