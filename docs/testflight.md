# Publishing to TestFlight

The iOS app is `org.vaporlens.Vaporlens` ("Vaporlens" in App Store Connect, team `EA3F6PEEAV`).
Builds are archived and uploaded from this Mac with Xcode's signed-in account. There is no EAS or fastlane.

## Each new build

1. In `packages/mobile/app.json`, raise `expo.ios.buildNumber` (a string: `"2"`, `"3"`, …).
   App Store Connect rejects a build number it has seen for that version. Change `expo.version`
   (now `0.1`) only for a new release; the build number can restart at `"1"` then.
2. Regenerate the native project and its pods. Prebuild may clear `ios/`, so always run both:

   ```sh
   cd packages/mobile
   export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
   npx expo prebuild --platform ios --no-install
   (cd ios && pod install)
   ```

3. Archive. Release bundles the JS into the app:

   ```sh
   xcodebuild -workspace ios/Vaporlens.xcworkspace -scheme Vaporlens -configuration Release \
     -destination 'generic/platform=iOS' -archivePath /tmp/vaporlens/Vaporlens.xcarchive \
     -allowProvisioningUpdates archive
   ```

   Optional check before uploading:

   ```sh
   /usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" -c "Print CFBundleVersion" \
     /tmp/vaporlens/Vaporlens.xcarchive/Products/Applications/Vaporlens.app/Info.plist
   ```

4. Upload. `ExportOptions.plist` tells the export to sign for the App Store and upload:

   ```sh
   xcodebuild -exportArchive -archivePath /tmp/vaporlens/Vaporlens.xcarchive \
     -exportOptionsPlist ExportOptions.plist -exportPath /tmp/vaporlens/export \
     -allowProvisioningUpdates
   ```

   It ends with `Upload succeeded` and `** EXPORT SUCCEEDED **`. You can ignore the
   `Upload Symbols Failed` warnings: the prebuilt frameworks (React, Hermes, SDWebImage, …) ship
   without dSYMs, so only their frames in crash reports stay unsymbolicated.

5. The build is processed in App Store Connect → Vaporlens → TestFlight, which takes about 5–15 minutes,
   and Apple emails when it's done. Internal testers get it right away. External testers need a
   Beta App Review, and the reviewer needs a Steam account to sign in with.

The GUI alternative to steps 3–4: open `ios/Vaporlens.xcworkspace`, pick "Any iOS Device (arm64)",
Product → Archive, then Distribute App → App Store Connect → Upload.

## Already set up

- `ios.config.usesNonExemptEncryption: false` in `app.json` answers the export compliance question
  (standard encryption only: HTTPS, WebRTC's DTLS-SRTP), so builds don't wait on it.
- Expo's generated 1024 px icon has no alpha channel, as the App Store requires.
- The TestFlight app and a dev build installed with `expo run:ios` share the bundle id, so
  installing one replaces the other.
