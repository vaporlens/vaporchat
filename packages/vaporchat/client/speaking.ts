const POLL_INTERVAL_MS = 150;
// audio level (0..1, as WebRTC reports it) above which a track counts as speech,
// and how long it stays "speaking" after going quiet
const SPEAKING_LEVEL = 0.03;
const HOLD_MS = 300;

interface AudioLevelStats {
  type: string;
  kind?: string;
  trackIdentifier?: string;
  audioLevel?: number;
}

/**
 * Calls `onChange` with the ids of the tracks (sent and received) that carry speech.
 * Steam has no speaking signal, the official client also measures levels locally.
 * Uses WebRTC stats so it works in browsers and react-native-webrtc alike.
 * Returns a function that stops watching.
 */
export function watchSpeaking(
  pc: RTCPeerConnection,
  onChange: (speakingTrackIds: ReadonlySet<string>) => void,
) {
  const lastLoudAt = new Map<string, number>();
  let speaking = new Set<string>();
  let polling = false;
  let stopped = false;

  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    const stats = await pc.getStats().catch(() => null);
    polling = false;
    if (!stats || stopped) return;
    const now = Date.now();
    stats.forEach((report: AudioLevelStats) => {
      const isAudio =
        (report.type === 'inbound-rtp' || report.type === 'media-source') &&
        report.kind === 'audio';
      if (!isAudio || !report.trackIdentifier) return;
      if ((report.audioLevel ?? 0) > SPEAKING_LEVEL) {
        lastLoudAt.set(report.trackIdentifier, now);
      }
    });
    const nowSpeaking = new Set(
      [...lastLoudAt]
        .filter(([, loudAt]) => now - loudAt < HOLD_MS)
        .map(([trackId]) => trackId),
    );
    const changed =
      nowSpeaking.size !== speaking.size ||
      [...nowSpeaking].some((trackId) => !speaking.has(trackId));
    if (changed) {
      speaking = nowSpeaking;
      onChange(speaking);
    }
  }, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
