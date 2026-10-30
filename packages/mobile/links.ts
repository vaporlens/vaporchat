import { Linking } from 'react-native';

/** Opens a link: the Steam app takes its links when it's installed, Safari the others. */
export function openLink(url: string) {
  void Linking.openURL(url);
}

/** The app's source code on GitHub. */
export const SOURCE_URL = 'https://github.com/vaporlens/vaporchat';
