import { launchImageLibraryAsync } from 'expo-image-picker';
import { useEffect, useState } from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
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

/** A photo from the library, ready for `sendImage`. Null when the user cancels. */
export async function pickImage(): Promise<ChatImage | null> {
  const picked = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    base64: true,
    quality: 0.85,
  });
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
