const POLL_INTERVAL_MS = 100;
// RMS above which a stream counts as speech, and how long it stays "speaking" after going quiet
const SPEAKING_THRESHOLD = 0.02;
const HOLD_MS = 300;

/**
 * Calls `onChange` when the stream starts or stops carrying speech. Steam has no
 * speaking signal, the official client also measures levels locally.
 * Returns a function that stops watching.
 */
export function watchSpeaking(
  audioContext: AudioContext,
  stream: MediaStream,
  onChange: (speaking: boolean) => void,
) {
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let speaking = false;
  let lastLoudAt = 0;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const now = Date.now();
    if (Math.sqrt(sum / samples.length) > SPEAKING_THRESHOLD) lastLoudAt = now;
    const nowSpeaking = now - lastLoudAt < HOLD_MS;
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      onChange(speaking);
    }
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    source.disconnect();
  };
}
