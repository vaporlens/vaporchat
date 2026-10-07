import type { TokenStore } from '../steam/logOn.ts';
import { VoiceConnection, type VoiceLogOnOptions } from './connection.ts';
import { Emitter } from './emitter.ts';
import { VoiceSession, type VoiceTarget } from './voiceSession.ts';

export interface IncomingCall {
  voiceChatId: string;
  steamid: string;
}

interface SteamVoiceEvents {
  incomingCalls: IncomingCall[];
  session: VoiceSession | null;
}

/**
 * Entry point for apps: tracks incoming 1:1 calls and runs at most one voice
 * session at a time, like the official client.
 */
export class SteamVoice extends Emitter<SteamVoiceEvents> {
  readonly connection: VoiceConnection;
  session: VoiceSession | null = null;
  #incoming = new Map<string, IncomingCall>();

  private constructor(connection: VoiceConnection) {
    super();
    this.connection = connection;
    connection.on(
      'VoiceChatClient.NotifyOneOnOneChatRequested#1',
      (request) => {
        const call = {
          voiceChatId: request.voice_chatid,
          steamid: request.steamid_partner,
        };
        if (this.#isCalling(call.steamid)) {
          this.#switchToTheirCall(call);
          return;
        }
        this.#incoming.set(call.voiceChatId, call);
        this.#emitIncoming();
      },
    );
    // the caller hung up (or the call got answered elsewhere) before we picked up
    connection.on('VoiceChatClient.NotifyVoiceChatEnded#1', (ended) => {
      this.#removeIncoming(ended.voice_chatid);
    });
  }

  /** Logs on to Steam with the stored refresh token, or `options.credentials` when there is none. */
  static async logOn(store: TokenStore, options?: VoiceLogOnOptions) {
    return new SteamVoice(await VoiceConnection.logOn(store, options));
  }

  /** Like `logOn` without waiting for Steam, see `VoiceConnection.start`. */
  static async start(store: TokenStore, options?: VoiceLogOnOptions) {
    return new SteamVoice(await VoiceConnection.start(store, options));
  }

  /** The signed-in account. Its name and avatar arrive shortly after logon, see `friendsChanged`. */
  get me() {
    return this.connection.me;
  }

  get incomingCalls() {
    return [...this.#incoming.values()];
  }

  joinGroupVoice(
    groupId: string,
    chatId: string,
    microphone: MediaStream | null,
  ) {
    return this.#start({ kind: 'group', groupId, chatId }, microphone);
  }

  /** Accepts their call instead when they are already calling us, like the official client. */
  callFriend(steamid: string, microphone: MediaStream | null) {
    const theirCall = this.incomingCalls.find(
      (call) => call.steamid === steamid,
    );
    if (theirCall) return this.acceptCall(theirCall, microphone);
    return this.#start({ kind: 'friend', steamid }, microphone);
  }

  acceptCall(call: IncomingCall, microphone: MediaStream | null) {
    this.#removeIncoming(call.voiceChatId);
    return this.#start(
      {
        kind: 'friend',
        steamid: call.steamid,
        incomingVoiceChatId: call.voiceChatId,
      },
      microphone,
    );
  }

  async declineCall(call: IncomingCall) {
    this.#removeIncoming(call.voiceChatId);
    await this.connection.call('VoiceChat.AnswerOneOnOneChat#1', {
      voice_chatid: call.voiceChatId,
      steamid_partner: call.steamid,
      accepted_request: false,
    });
  }

  async #start(target: VoiceTarget, microphone: MediaStream | null) {
    // a failed leave must not keep the user out of the next chat, steam drops stale sessions on its own
    await this.session?.leave().catch((err: Error) => {
      console.error('Leaving the previous voice chat failed:', err.message);
    });
    const session = new VoiceSession({
      connection: this.connection,
      selfSteamId: this.me.steamid,
      target,
      microphone,
    });
    session.on('ended', () => {
      if (this.session !== session) return;
      this.session = null;
      this.emit('session', null);
    });
    this.session = session;
    this.emit('session', session);
    session.start();
    return session;
  }

  /** We are ringing them (not answering them) and the call isn't over. */
  #isCalling(steamid: string) {
    const target = this.session?.target;
    return (
      target?.kind === 'friend' &&
      target.steamid === steamid &&
      !target.incomingVoiceChatId
    );
  }

  // both sides called each other at once: take their call. Ours is only dropped locally,
  // hanging it up would end theirs too.
  #switchToTheirCall(call: IncomingCall) {
    const ours = this.session;
    const microphone = ours?.detachMicrophone() ?? null;
    ours?.close('switched to their simultaneous call');
    void this.#start(
      {
        kind: 'friend',
        steamid: call.steamid,
        incomingVoiceChatId: call.voiceChatId,
      },
      microphone,
    );
  }

  #removeIncoming(voiceChatId: string) {
    if (this.#incoming.delete(voiceChatId)) this.#emitIncoming();
  }

  #emitIncoming() {
    this.emit('incomingCalls', this.incomingCalls);
  }
}
