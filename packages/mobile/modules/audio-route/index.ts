import { requireOptionalNativeModule } from 'expo';

interface AudioRouteModule {
  setSpeakerOn(on: boolean): void;
  /** Android only, iOS's audio session ends with WebRTC's */
  reset?(): void;
  hasHeadset(): boolean;
  startRinging(inCall: boolean): void;
  stopRinging(): void;
}

const AudioRoute = requireOptionalNativeModule<AudioRouteModule>('AudioRoute');

/** Plays voice chat through the loudspeaker, or off it through a headset or the earpiece. */
export function setSpeakerOn(on: boolean) {
  AudioRoute?.setSpeakerOn(on);
}

/** Whether a headset is connected that voice chat can play through instead of the speaker. */
export function hasHeadset() {
  return AudioRoute?.hasHeadset() ?? false;
}

/** Gives the audio back to the rest of the phone once voice is over. */
export function resetAudioRoute() {
  AudioRoute?.reset?.();
}

/**
 * Rings while a call comes in: the phone's ringtone on Android, a bundled ring on iOS. In voice
 * chat a call waiting beep instead, the way phones do.
 */
export function setRinging(on: boolean, inCall: boolean) {
  if (on) AudioRoute?.startRinging(inCall);
  else AudioRoute?.stopRinging();
}
