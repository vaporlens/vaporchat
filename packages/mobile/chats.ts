import {
  type ImagePickerOptions,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { ChatPart } from 'vaporchat/protocol';
import type { ChatImage } from 'vaporchat/steam/imageUpload';

/** Unread messages per chat, shared with the account's other devices. The open chat reads them. */
export function useUnread(voice: SteamVoice) {
  const { unread } = voice.connection;
  const [current, setCurrent] = useState(unread.current);

  useEffect(() => {
    setCurrent(unread.current);
    return unread.on('changed', setCurrent);
  }, [unread]);

  return current;
}

/**
 * A photo from the library or the camera, ready for `sendImage`. Null when the user cancels or
 * doesn't let the app use the camera, which tells them where to allow it.
 */
export async function pickImage(
  source: 'library' | 'camera',
): Promise<ChatImage | null> {
  const options: ImagePickerOptions = {
    mediaTypes: ['images'],
    base64: true,
    quality: 0.85,
  };
  if (source === 'camera' && !(await requestCameraPermissionsAsync()).granted) {
    Alert.alert(
      'Camera access is off',
      'Allow Vaporlens to use the camera in Settings to take photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return null;
  }
  const picked = await (source === 'camera'
    ? launchCameraAsync(options)
    : launchImageLibraryAsync(options));
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset?.base64) return null;
  // a plain loop, photos are megabytes and Uint8Array.from's iterator is slow on Hermes
  const binary = atob(asset.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return {
    bytes,
    // the picker's base64 is always re-encoded as JPEG
    type: 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}

// spoilers stay hidden
function partText(part: ChatPart): string {
  if (
    part.kind === 'text' ||
    part.kind === 'link' ||
    part.kind === 'code' ||
    part.kind === 'mention'
  )
    return part.text;
  if (part.kind === 'quote') return `${part.parts.map(partText).join('')}\n`;
  if (part.kind === 'emoticon') return `:${part.name}:`;
  if (
    part.kind === 'storeLink' ||
    part.kind === 'webPreview' ||
    part.kind === 'youtube'
  )
    return part.url;
  if (part.kind === 'spoiler') return 'Spoiler';
  return part.kind === 'sticker' ? 'Sticker' : 'Image';
}

/** A message as plain text, for notifications and search. */
export function messageText(parts: ChatPart[]) {
  return parts.map(partText).join('').trim() || 'Message';
}
