import type { Participant } from 'vaporchat/client/participants';
import { watchSpeaking } from 'vaporchat/client/speaking';

interface Player {
  stream: MediaStream;
  audio: HTMLAudioElement;
  stopWatching: () => void;
}

/** Plays every participant's audio and tracks who is speaking (including us). */
export class Playback {
  #audioContext: AudioContext | null = null;
  #players = new Map<string, Player>();
  #localWatch: (() => void) | null = null;
  #speaking = new Set<string>();
  #container: HTMLElement;
  #onSpeakingChange: () => void;

  constructor(container: HTMLElement, onSpeakingChange: () => void) {
    this.#container = container;
    this.#onSpeakingChange = onSpeakingChange;
  }

  /** Must run inside a click handler, mobile browsers keep audio locked until then. */
  unlock() {
    this.#audioContext ??= new AudioContext();
    void this.#audioContext.resume();
  }

  isSpeaking(steamid: string) {
    return this.#speaking.has(steamid);
  }

  #watch(steamid: string, stream: MediaStream) {
    if (!this.#audioContext) return () => {};
    return watchSpeaking(this.#audioContext, stream, (speaking) => {
      if (speaking) this.#speaking.add(steamid);
      else this.#speaking.delete(steamid);
      this.#onSpeakingChange();
    });
  }

  watchMicrophone(steamid: string, microphone: MediaStream | null) {
    this.#localWatch?.();
    this.#localWatch = microphone ? this.#watch(steamid, microphone) : null;
  }

  sync(participants: Participant[], deafened: boolean) {
    const wanted = new Map(
      participants
        .filter(
          (p): p is Participant & { stream: MediaStream } => p.stream !== null,
        )
        .map((p) => [p.steamid, p.stream]),
    );
    for (const [steamid, player] of this.#players) {
      if (wanted.get(steamid) !== player.stream) this.#remove(steamid, player);
    }
    for (const [steamid, stream] of wanted) {
      if (this.#players.has(steamid)) continue;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.srcObject = stream;
      this.#container.append(audio);
      audio.play().catch((err: Error) => {
        console.error(`Could not play audio of ${steamid}:`, err.message);
      });
      this.#players.set(steamid, {
        stream,
        audio,
        stopWatching: this.#watch(steamid, stream),
      });
    }
    for (const player of this.#players.values()) {
      player.audio.muted = deafened;
    }
  }

  #remove(steamid: string, player: Player) {
    player.stopWatching();
    player.audio.srcObject = null;
    player.audio.remove();
    this.#players.delete(steamid);
    this.#speaking.delete(steamid);
  }

  stopAll() {
    for (const [steamid, player] of this.#players)
      this.#remove(steamid, player);
    this.#localWatch?.();
    this.#localWatch = null;
    this.#speaking.clear();
    this.#onSpeakingChange();
  }
}
