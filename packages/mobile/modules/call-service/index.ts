import { requireOptionalNativeModule } from 'expo';
import { AppRegistry, PermissionsAndroid } from 'react-native';

interface CallServiceModule {
  /** `call`: voice is on, otherwise it only keeps the connection */
  start(call: boolean): void;
  stop(): void;
}

// Android only, iOS keeps voice running with its audio background mode
const CallService =
  requireOptionalNativeModule<CallServiceModule>('CallService');

// started while the service runs, it keeps the app's timers going in the background
AppRegistry.registerHeadlessTask(
  'KeepRunning',
  () => () => new Promise<void>(() => {}),
);

let callActive = false;
let stayConnected = false;

// starting a running one again only updates it, so a failed or reloaded start is retried
function update() {
  if (!CallService) return;
  if (callActive || stayConnected) {
    // without it the notification only shows in the system's list of running apps
    void PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    CallService.start(callActive);
  } else {
    CallService.stop();
  }
}

/** Keeps voice running with the app in the background, with a notification while it is. */
export function setCallActive(on: boolean) {
  callActive = on;
  update();
}

/** Keeps the app connected to Steam in the background, for alerts. Android only. */
export function setStayConnected(on: boolean) {
  stayConnected = on;
  update();
}

/** Whether `setStayConnected` does anything here. */
export const canStayConnected = CallService !== null;
