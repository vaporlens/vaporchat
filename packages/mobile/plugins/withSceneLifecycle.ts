import {
  type ConfigPlugin,
  withAppDelegate,
  withInfoPlist,
} from 'expo/config-plugins';

/**
 * Apps built with the iOS 27 SDK must adopt the scene life cycle or UIKit traps at launch.
 * Expo 57 ships the runtime for it (`ExpoAppSceneDelegate`) but its template doesn't use it yet,
 * so this applies what the SDK 58 template does. Delete this plugin after upgrading to SDK 58.
 */
const withSceneLifecycle: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            // Expo's own scene delegate, exported to Objective-C under this name
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return mod;
  });

  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes('ExpoReactNativeFactoryProvider')) return mod;

    const declaration = 'class AppDelegate: ExpoAppDelegate {';
    // the scene delegate creates the window and starts React Native instead
    const windowStart =
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n\n/;
    if (!contents.includes(declaration) || !windowStart.test(contents)) {
      throw new Error(
        'withSceneLifecycle: AppDelegate.swift no longer matches the Expo 57 template',
      );
    }
    contents = contents
      .replace(
        declaration,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      )
      .replace(windowStart, '');
    mod.modResults.contents = contents;
    return mod;
  });
};

export default withSceneLifecycle;
