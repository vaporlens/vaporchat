# Running on iOS

The iOS app is `org.vaporlens.Vaporlens`, an Expo dev build like the Android one (Expo Go can't
load `react-native-webrtc`), built locally with Xcode. There is no EAS. Release builds are covered
in [`testflight.md`](testflight.md).

## Building and running

1. Install dependencies at the repo root with `npm ci`.
2. Build, install and start Metro:

   ```sh
   cd packages/mobile
   export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
   npx expo run:ios            # simulator
   npx expo run:ios --device   # phone
   ```

   The first run generates `ios/` (gitignored). Without native changes,
   `npx expo start --dev-client` is enough.
3. After changing config plugins in `app.json` (Info.plist permission texts, say), apply them and
   reinstall the pods. After other native changes, such as a new native dependency, run only the
   `pod install`:

   ```sh
   npx expo prebuild --platform ios --no-install
   (cd ios && pod install)
   ```

To bundle the JS into the app on a phone:

```sh
npx expo run:ios --device <udid> --configuration Release --no-bundler
```

The install is done once the log reaches `Connecting to: <phone>`; the command never exits after
that, so stop it there.

To open the app in the simulator against a running Metro yourself:

```sh
xcrun simctl openurl <udid> "exp+vaporchat://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

## Gotchas

- **Xcode 27 requires the UIScene lifecycle.** `plugins/withSceneLifecycle.ts` backports Expo SDK
  58's template; delete it after upgrading to SDK 58.
- **The Simulator app is called DeviceHub** in Xcode 27.
- **`expo run:ios` fails at the very end in a sandboxed shell**, when it opens the Simulator through
  AppleScript. The app is installed by then; open it with `simctl openurl` as above.
- **`pod install` needs `DEVELOPER_DIR`** pointing at Xcode, not the Command Line Tools.
