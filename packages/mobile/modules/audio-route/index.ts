import { type NativeModule, requireOptionalNativeModule } from 'expo';

/** Somewhere voice chat can play. */
export interface AudioOutput {
  id: string;
  kind: 'speaker' | 'earpiece' | 'wired' | 'bluetooth' | 'usb';
  /** a headset's own name, built-in ones are named after the phone */
  name: string;
}

declare class AudioRouteModule extends NativeModule<{
  /** headsets connected or went, or where audio plays changed */
  onOutputsChange: () => void;
}> {
  /** headsets first, in the order to prefer them */
  outputs(): AudioOutput[];
  setOutput(id: string): void;
  /** Android only, iOS's audio session ends with WebRTC's */
  reset?(): void;
  startRinging(inCall: boolean): void;
  stopRinging(): void;
}

const AudioRoute = requireOptionalNativeModule<AudioRouteModule>('AudioRoute');

/** Where voice chat can play right now. iOS lists Bluetooth headsets only once voice is on. */
export function audioOutputs() {
  return AudioRoute?.outputs() ?? [];
}

/** Plays voice chat through one of `audioOutputs`. */
export function setAudioOutput(id: string) {
  AudioRoute?.setOutput(id);
}

/** Calls `listener` as headsets connect and go, returns the unsubscribe. */
export function onAudioOutputsChange(listener: () => void) {
  const subscription = AudioRoute?.addListener('onOutputsChange', listener);
  return () => subscription?.remove();
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
