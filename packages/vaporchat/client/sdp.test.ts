import { describe, expect, it } from 'vitest';
import { steamIdFromAccountId } from '../steam/friends.ts';
import { accountIdFromStreamId, mungeOpusFmtp } from './sdp.ts';

const offer = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  'a=group:BUNDLE 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9',
  'a=mid:0',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:9 G722/8000',
  '',
].join('\r\n');

describe('mungeOpusFmtp', () => {
  it('forces the official client opus parameters and leaves other codecs alone', () => {
    const munged = mungeOpusFmtp(offer);
    expect(munged).toContain(
      'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n',
    );
    expect(munged).not.toContain('stereo=1');
    expect(munged).toContain('a=fmtp:63 111/111\r\n');
  });
});

describe('steam ids', () => {
  it('maps account ids to SteamID64', () => {
    expect(steamIdFromAccountId(22)).toBe('76561197960265750');
  });

  it('reads the account id from steam stream ids', () => {
    expect(accountIdFromStreamId('Peer-3-27266930-abc')).toBe(27266930);
    expect(accountIdFromStreamId('{some-random-msid}')).toBeNull();
  });
});
