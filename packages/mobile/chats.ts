import { launchImageLibraryAsync } from 'expo-image-picker';
import { useEffect, useState } from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { ChatTarget } from 'vaporchat/protocol';
import type { ChatImage } from 'vaporchat/steam/imageUpload';
import { chatKey } from 'vaporchat/steam/messages';

/**
 * Messages from others per chat (by `chatKey`) since the app started, except in the open chat.
 * Opening a chat clears its count.
 */
export function useUnread(voice: SteamVoice, open: ChatTarget | null) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const openKey = open ? chatKey(open) : null;

  useEffect(() => {
    if (openKey) {
      setUnread(({ [openKey]: _read, ...rest }) => rest);
    }
    return voice.connection.on('message', ({ chat, message }) => {
      const key = chatKey(chat);
      if (key === openKey || message.sender === voice.me.steamid) return;
      setUnread((counts) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }));
    });
  }, [voice, openKey]);

  return unread;
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
