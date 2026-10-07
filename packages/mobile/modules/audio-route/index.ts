import { requireOptionalNativeModule } from 'expo';

interface AudioRouteModule {
  setSpeakerOn(on: boolean): void;
  /** Android only, iOS's audio session ends with WebRTC's */
  reset?(): void;
}

const AudioRoute = requireOptionalNativeModule<AudioRouteModule>('AudioRoute');

/** Plays voice chat through the loudspeaker instead of the earpiece. */
export function setSpeakerOn(on: boolean) {
  AudioRoute?.setSpeakerOn(on);
}

/** Gives the audio back to the rest of the phone once voice is over. */
export function resetAudioRoute() {
  AudioRoute?.reset?.();
}
