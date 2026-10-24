import { describe, expect, it } from 'vitest';
import { PlanBToUnifiedPlan } from './planB.ts';

function steamOffer(streams: string[]) {
  return [
    'v=0',
    'o=- 1 2 IN IP4 10.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=ice-lite',
    'm=audio 5000 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 10.0.0.1',
    'a=rtpmap:111 opus/48000/2',
    'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
    'a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid',
    'a=setup:passive',
    'a=mid:0',
    'a=sendrecv',
    'a=ice-ufrag:abcd',
    'a=candidate:1 1 UDP 1 10.0.0.1 5000 typ host',
    'a=rtcp-mux',
    ...streams.flatMap((id) => {
      const ssrc = id.split('-').at(-1);
      return [`a=ssrc:${ssrc} cname:${id}`, `a=ssrc:${ssrc} msid:${id}`];
    }),
    '',
  ].join('\r\n');
}

function sections(sdp: string) {
  return sdp.split(/\r\n(?=m=)/).slice(1);
}

describe('PlanBToUnifiedPlan', () => {
  it('gives every peer stream its own receive-only section and drops our echoed own stream', () => {
    const converter = new PlanBToUnifiedPlan();
    const converted = converter.convert(
      steamOffer(['Self-1-100', 'Peer-1-2-200', 'Peer-1-3-300']),
    );
    const [main, peerA, peerB] = sections(converted);

    expect(converted).toContain('a=group:BUNDLE 0 0-1 0-2\r\n');
    expect(converted).not.toContain('sdes:mid');
    expect(main).toContain('a=sendrecv');
    expect(converted).not.toContain('a=ssrc:100 ');
    expect(main).not.toContain('a=ssrc:200 ');
    expect(peerA).toMatch(/a=mid:0-1\r\na=sendonly/);
    expect(peerA).toContain('a=msid:Peer-1-2-200 Peer-1-2-200-audio');
    expect(peerA).toContain('a=ice-ufrag:abcd');
    expect(peerB).toContain('a=ssrc:300 msid:Peer-1-3-300');
    expect(converter.ssrcForMid('0-2')).toBe(300);
    expect(converter.ssrcForMid('0')).toBeNull();
  });

  it('keeps sections stable across updates and deactivates streams that left', () => {
    const converter = new PlanBToUnifiedPlan();
    converter.convert(steamOffer(['Peer-1-2-200', 'Peer-1-3-300']));
    const converted = converter.convert(
      steamOffer(['Peer-1-3-300', 'Peer-1-4-400']),
    );
    const [, left, stayed, joined] = sections(converted);

    expect(left).toMatch(/a=mid:0-1\r\na=inactive/);
    expect(left).not.toContain('a=ssrc');
    expect(stayed).toContain('a=mid:0-2');
    expect(stayed).toContain('a=ssrc:300 ');
    expect(joined).toContain('a=mid:0-3');
    expect(joined).toContain('a=ssrc:400 ');
  });

  // libwebrtc gives an msid-less main section a shared default stream whenever no section
  // signals msid, and announces it only once: a peer leaving then rejoining removed that
  // stream twice, which aborts react-native-webrtc on Android
  it('signals the main section as streamless in every description, with or without peers', () => {
    const converter = new PlanBToUnifiedPlan();
    for (const streams of [[], ['Peer-1-2-200'], [], ['Peer-1-2-200']]) {
      const [main] = sections(converter.convert(steamOffer(streams)));
      expect(main).toMatch(/^a=msid:-\r?$/m);
    }
  });
});
