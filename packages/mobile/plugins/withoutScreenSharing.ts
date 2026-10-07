import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
} from 'expo/config-plugins';

const SERVICE = 'com.oney.WebRTCModule.MediaProjectionService';

/**
 * Drops react-native-webrtc's screen sharing service, voice chat never shares the screen and
 * Google Play asks apps to justify every kind of foreground service they declare.
 */
const withoutScreenSharing: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(
      mod.modResults,
    );
    const application =
      AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const services = application.service ?? [];
    if (!services.some((service) => service.$['android:name'] === SERVICE)) {
      application.service = [
        ...services,
        { $: { 'android:name': SERVICE, 'tools:node': 'remove' } },
      ];
    }
    mod.modResults = manifest;
    return mod;
  });

export default withoutScreenSharing;
