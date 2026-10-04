import { requireOptionalNativeModule } from 'expo';

interface AudioRouteModule {
  setSpeakerOn(on: boolean): void;
}

// only built for iOS so far, Android keeps its default output
const AudioRoute = requireOptionalNativeModule<AudioRouteModule>('AudioRoute');

/** Plays voice chat through the loudspeaker instead of the earpiece. */
export function setSpeakerOn(on: boolean) {
  AudioRoute?.setSpeakerOn(on);
}
