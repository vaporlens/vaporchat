import type { OwnedEmoticons } from '../protocol.ts';
import { emoticonUrl, stickerUrl } from './bbcode.ts';
import { EMsg, type SteamCM } from './cm.ts';
import { decodeProto } from './protos.ts';

interface Owned {
  name: string;
  time_last_used?: number;
  time_received?: number;
}

interface EmoticonListMessage {
  emoticons?: Owned[];
  stickers?: Owned[];
}

function recentFirst(a: Owned, b: Owned) {
  return (
    (b.time_last_used ?? 0) - (a.time_last_used ?? 0) ||
    (b.time_received ?? 0) - (a.time_received ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

/** The emoticons and stickers the account owns. */
export async function getEmoticons(cm: SteamCM): Promise<OwnedEmoticons> {
  const list = decodeProto<EmoticonListMessage>(
    'CMsgClientEmoticonList',
    await cm.request(
      EMsg.ClientGetEmoticonList,
      'CMsgClientGetEmoticonList',
      {},
      EMsg.ClientEmoticonList,
    ),
  );
  return {
    // the list names emoticons with their colons, `:steamhappy:`, BBCode and URLs go without
    emoticons: [...(list.emoticons ?? [])].sort(recentFirst).map((owned) => {
      const name = owned.name.replace(/^:|:$/g, '');
      return { kind: 'emoticon', name, url: emoticonUrl(name) };
    }),
    stickers: [...(list.stickers ?? [])].sort(recentFirst).map((owned) => ({
      kind: 'sticker',
      name: owned.name,
      url: stickerUrl(owned.name),
    })),
  };
}
