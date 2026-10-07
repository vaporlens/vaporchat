import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid } from 'react-native';

interface CallServiceModule {
  start(): void;
  stop(): void;
}

// Android only, iOS keeps voice running with its audio background mode
const CallService =
  requireOptionalNativeModule<CallServiceModule>('CallService');

let active = false;

/** Keeps voice running with the app in the background, with a notification while it is. */
export function setCallActive(on: boolean) {
  if (!CallService || on === active) return;
  active = on;
  if (on) {
    // without it the notification only shows in the system's list of running apps
    void PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    CallService.start();
  } else {
    CallService.stop();
  }
}
