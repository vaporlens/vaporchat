import type { Participant } from 'vaporchat/client/participants';

/** Plays every participant's audio through its own <audio> element. */
export class Playback {
  #players = new Map<
    string,
    { stream: MediaStream; audio: HTMLAudioElement }
  >();
  #container: HTMLElement;

  constructor(container: HTMLElement) {
    this.#container = container;
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
      if (wanted.get(steamid) !== player.stream) this.#remove(steamid);
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
      this.#players.set(steamid, { stream, audio });
    }
    for (const player of this.#players.values()) {
      player.audio.muted = deafened;
    }
  }

  #remove(steamid: string) {
    const player = this.#players.get(steamid);
    if (!player) return;
    player.audio.srcObject = null;
    player.audio.remove();
    this.#players.delete(steamid);
  }

  stopAll() {
    for (const steamid of [...this.#players.keys()]) this.#remove(steamid);
  }
}
