import type { UserVoiceStatus } from '../protocol.ts';

export interface Participant {
  steamid: string;
  /** remote audio, play it through an <audio> element */
  stream: MediaStream | null;
  micMuted: boolean;
  outputMuted: boolean;
  noMic: boolean;
}

/** Other people in a voice chat, keyed by SteamID64. */
export class Participants {
  #bySteamId = new Map<string, Participant>();
  #selfSteamId: string;

  constructor(selfSteamId: string) {
    this.#selfSteamId = selfSteamId;
  }

  list() {
    return [...this.#bySteamId.values()];
  }

  /** Returns null for ourselves, steam includes us in membership notifications. */
  add(steamid: string): Participant | null {
    if (steamid === this.#selfSteamId) return null;
    let participant = this.#bySteamId.get(steamid);
    if (!participant) {
      participant = {
        steamid,
        stream: null,
        micMuted: false,
        outputMuted: false,
        noMic: false,
      };
      this.#bySteamId.set(steamid, participant);
    }
    return participant;
  }

  remove(steamid: string) {
    this.#bySteamId.delete(steamid);
  }

  setStream(steamid: string, stream: MediaStream) {
    const participant = this.add(steamid);
    if (participant) participant.stream = stream;
  }

  /** Clears the stream only if it is still the given one (a newer one may have replaced it). */
  clearStream(steamid: string, stream: MediaStream) {
    const participant = this.#bySteamId.get(steamid);
    if (participant?.stream !== stream) return false;
    participant.stream = null;
    return true;
  }

  clearAllStreams() {
    for (const participant of this.#bySteamId.values()) {
      participant.stream = null;
    }
  }

  applyStatus(status: UserVoiceStatus) {
    const participant = this.add(status.user_steamid);
    if (!participant) return;
    participant.micMuted = status.user_muted_mic_locally === true;
    participant.outputMuted = status.user_muted_output_locally === true;
    participant.noMic = status.user_has_no_mic_for_session === true;
  }
}
