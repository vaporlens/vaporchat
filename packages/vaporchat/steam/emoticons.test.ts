import { describe, expect, it } from 'vitest';
import type { EmoticonPart } from '../protocol.ts';
import { EMsg, type SteamCM } from './cm.ts';
import { getEmoticons } from './emoticons.ts';
import { encodeProto } from './protos.ts';

const ECONOMY = 'https://community.fastly.steamstatic.com/economy';

function emoticon(name: string): EmoticonPart {
  return { kind: 'emoticon', name, url: `${ECONOMY}/emoticonlarge/${name}` };
}

describe('getEmoticons', () => {
  it('lists what Steam answers with, recently used first, emoticons without colons', async () => {
    const cm = {
      async request(emsg: number, _type: string, _body: object, reply: number) {
        expect([emsg, reply]).toEqual([
          EMsg.ClientGetEmoticonList,
          EMsg.ClientEmoticonList,
        ]);
        return encodeProto('CMsgClientEmoticonList', {
          emoticons: [
            { name: ':steamsad:' },
            { name: ':steamhappy:', time_last_used: 50 },
          ],
          stickers: [
            { name: 'Old Cat', time_received: 10 },
            { name: 'New Cat', time_received: 20 },
          ],
        });
      },
    };
    expect(await getEmoticons(cm as unknown as SteamCM)).toEqual({
      emoticons: [emoticon('steamhappy'), emoticon('steamsad')],
      stickers: [
        {
          kind: 'sticker',
          name: 'New Cat',
          url: `${ECONOMY}/sticker/New%20Cat`,
        },
        {
          kind: 'sticker',
          name: 'Old Cat',
          url: `${ECONOMY}/sticker/Old%20Cat`,
        },
      ],
    });
  });
});
