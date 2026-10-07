# Running on Android

The Android app is `com.yamalight.vaporchat`. It's an Expo dev build like the iOS one (Expo Go can't
load `react-native-webrtc`), built locally with Gradle. There is no EAS. Release builds are covered
under [Release builds](#release-builds).

## Toolchain

The Android build pins exact versions and only accepts those. Newer ones don't satisfy it.

- **JDK 17**, with `JAVA_HOME` pointing at it. A newer system JDK can stay installed but must not be
  the one `JAVA_HOME` points at.
- **Android SDK**, most easily installed with Android Studio. In Settings → Languages & Frameworks →
  Android SDK, tick "Show Package Details" and install:
  - SDK Platforms: Android **36** (not 36.1, a separate package the build doesn't use)
  - Build-Tools **36.0.0** and **35.0.0** (Android Gradle Plugin's default, which some modules
    like `:expo` fall back to)
  - NDK (Side by side) **27.1.12297006**
  - CMake **3.22.1**
  - Platform-Tools, Command-line Tools and the Emulator, plus an x86_64 system image for an
    emulator

  The versions come from React Native's `node_modules/react-native/gradle/libs.versions.toml`
  (`compileSdk`, `buildTools`, `ndkVersion`), so check there after upgrading Expo or React Native.
  Gradle downloads missing packages by itself when it can write to the SDK and the licenses are
  accepted, which Studio's setup does.
- Environment, e.g. in `~/.profile` (fish: `set -Ux` and `fish_add_path`):

  ```sh
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
  ```

- For the emulator, your user needs access to `/dev/kvm` (the `kvm` group, unless the device's ACL
  already grants it).

## Building and running

1. Install dependencies at the repo root with `npm ci`. Prebuild fails with "Failed to resolve
   plugin" when `node_modules` is behind the lockfile.
2. Start an emulator (`emulator -avd <name>`, `emulator -list-avds` lists them) or plug in a phone
   with USB debugging on.
3. Build, install and start Metro:

   ```sh
   cd packages/mobile
   npx expo run:android
   ```

   The first run generates `android/` (gitignored; after changing config plugins in `app.json`, run
   `npx expo prebuild --platform android --no-install` to apply them) and takes a few minutes. Later
   runs reuse Gradle's cache. Without native changes, `npx expo start --dev-client` is enough.

To open the app against a running Metro yourself:

```sh
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d "exp+vaporchat://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.yamalight.vaporchat
```

## Gotchas

- **Android Studio pins Gradle to its own JDK.** Opening `packages/mobile/android` in Studio writes
  `android/gradle/gradle-daemon-jvm.properties` with `toolchainVersion=25`. Gradle then wants to
  download a JDK 25 and the build fails with "Unable to download toolchain". Delete that file, and
  decline Studio's offer to update the daemon JVM. Studio isn't needed to edit the code.
- **Build from a terminal, not Studio's.** The Flathub Android Studio runs in a sandbox with its own
  `JAVA_HOME` and no Node, so `expo run:android` fails in its terminal.
- **HEVC video shows green in the emulator.** Its host-backed HEVC decoder (`c2.goldfish.hevc.decoder`)
  outputs empty frames. The app avoids HEVC on Android (description animations play as VP9 webm,
  trailers are H.264), so this only matters for new video code; check such video on a phone.

## Release builds

A release build bundles the JS into the app and is signed with your upload key
(`plugins/withReleaseSigning.ts`). Without the key, a release build fails instead of going out
signed with the debug key.

### Once: the upload key

1. Create it outside the repo and keep a backup. With Play App Signing, Google holds the key that
   signs what users install, and a lost upload key can be reset through Play support.

   ```sh
   keytool -genkeypair -v -keystore ~/vaporlens-upload.keystore -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Tell Gradle where it is, in `~/.gradle/gradle.properties` (not the repo's `gradle.properties`):

   ```properties
   VAPORLENS_UPLOAD_STORE_FILE=/home/<you>/vaporlens-upload.keystore
   VAPORLENS_UPLOAD_STORE_PASSWORD=<store password>
   VAPORLENS_UPLOAD_KEY_ALIAS=upload
   VAPORLENS_UPLOAD_KEY_PASSWORD=<key password>
   ```

### Each new build

1. In `packages/mobile/app.json`, raise `expo.android.versionCode` (a number: `2`, `3`, …). Google Play
   rejects a version code it has seen. `expo.version` is the version users see, shared with iOS.
2. Regenerate the native project and build:

   ```sh
   cd packages/mobile
   npx expo prebuild --platform android --no-install
   cd android
   ./gradlew bundleRelease    # for Google Play: app/build/outputs/bundle/release/app-release.aab
   ./gradlew assembleRelease  # to install directly: app/build/outputs/apk/release/app-release.apk
   ```

   An APK installs with `adb install app/build/outputs/apk/release/app-release.apk`. A debug build
   on the same device is signed with a different key, so uninstall it first.

There is no Google Play listing yet. Its first upload creates the app in the Play Console, which then
asks about the permissions and foreground services below.

### Already set up

- `android.blockedPermissions` in `app.json` drops `CAMERA` and `SYSTEM_ALERT_WINDOW`, which
  react-native-webrtc's config plugin and expo-image-picker add. The app only picks photos from the
  library and never draws over other apps.
- `plugins/withoutScreenSharing.ts` drops react-native-webrtc's screen sharing service, so its
  `mediaProjection` foreground service type isn't declared.
- Voice runs in a foreground service (`modules/call-service`) of type `microphone`, or
  `mediaPlayback` when the microphone permission isn't granted (voice then joins listen-only).
  The Play Console asks why the app uses each type.
