import { type ConfigPlugin, withAppBuildGradle } from 'expo/config-plugins';

// the upload key's Gradle properties, kept out of the repo in ~/.gradle/gradle.properties
const release = `        release {
            if (findProperty('VAPORLENS_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('VAPORLENS_UPLOAD_STORE_FILE'))
                storePassword findProperty('VAPORLENS_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('VAPORLENS_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('VAPORLENS_UPLOAD_KEY_PASSWORD')
            }
        }
`;

/**
 * Signs Android release builds with the upload key instead of Expo's default, the debug key.
 * Without the key's properties a release build fails rather than going out debug-signed.
 */
const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes('VAPORLENS_UPLOAD_STORE_FILE')) return mod;

    const signingConfigs = /(signingConfigs \{\n\s*debug \{[^}]*\}\n)/;
    const releaseSigning =
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/;
    if (!signingConfigs.test(contents) || !releaseSigning.test(contents)) {
      throw new Error(
        'withReleaseSigning: app/build.gradle no longer matches the Expo 57 template',
      );
    }
    contents = contents
      .replace(signingConfigs, `$1${release}`)
      .replace(releaseSigning, '$1signingConfig signingConfigs.release');
    mod.modResults.contents = contents;
    return mod;
  });

export default withReleaseSigning;
