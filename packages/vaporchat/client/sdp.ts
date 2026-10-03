// Steam's client forces this exact opus fmtp on its offers (FEC + DTX, mono)
const STEAM_OPUS_FMTP = 'minptime=10;useinbandfec=1;usedtx=1';
const STEAMID64_BASE = 76561197960265728n;

/** Replaces the opus fmtp line of every m-section the same way the official client does. */
export function mungeOpusFmtp(sdp: string) {
  const opusPayloadTypes = new Set(
    [...sdp.matchAll(/^a=rtpmap:(\d+) opus\//gim)].map((match) => match[1]),
  );
  return sdp.replace(/^a=fmtp:(\d+) .*$/gm, (line, payloadType: string) =>
    opusPayloadTypes.has(payloadType)
      ? `a=fmtp:${payloadType} ${STEAM_OPUS_FMTP}`
      : line,
  );
}

export function steamIdFromAccountId(accountId: number) {
  return (STEAMID64_BASE + BigInt(accountId)).toString();
}

/** Steam names each remote participant's media stream `Peer-<n>-<accountid>-...`. */
export function accountIdFromStreamId(streamId: string): number | null {
  const match = streamId.match(/Peer-(\d+)-(\d+)-/);
  return match ? Number(match[2]) : null;
}
