// Steam's server describes every participant as another `a=ssrc` block inside one audio
// m-section (Plan B). Browsers only speak Unified Plan, where each remote stream needs its own
// m-section, so the server's descriptions get rewritten before they are applied.
// That is safe because Steam never sees our answers, only the acknowledgement.

const MID_EXTENSION = 'urn:ietf:params:rtp-hdrext:sdes:mid';

interface RemoteStream {
  ssrc: number;
  streamId: string;
  cname: string;
}

function splitSections(sdp: string) {
  const [session, ...media] = sdp.trim().split(/\r?\n(?=m=)/);
  return { session, media };
}

function lines(section: string) {
  return section.split(/\r?\n/).filter(Boolean);
}

function parseStreams(sectionLines: string[]): RemoteStream[] {
  const bySsrc = new Map<number, RemoteStream>();
  for (const line of sectionLines) {
    const match = line.match(/^a=ssrc:(\d+) (\w+):(\S+)/);
    if (!match) continue;
    const ssrc = Number(match[1]);
    let stream = bySsrc.get(ssrc);
    if (!stream) {
      stream = { ssrc, streamId: `ssrc-${ssrc}`, cname: `ssrc-${ssrc}` };
      bySsrc.set(ssrc, stream);
    }
    if (match[2] === 'msid') stream.streamId = match[3];
    if (match[2] === 'cname') stream.cname = match[3];
  }
  return [...bySsrc.values()];
}

/**
 * `Self-...` is steam echoing our own sending ssrc. It's dropped: declaring our own ssrc as a
 * remote one would trigger the browser's ssrc collision handling and change our sending ssrc.
 */
function isOwnStream(stream: RemoteStream) {
  return stream.streamId.startsWith('Self-');
}

function streamLines(stream: RemoteStream) {
  return [
    `a=msid:${stream.streamId} ${stream.streamId}-audio`,
    `a=ssrc:${stream.ssrc} cname:${stream.cname}`,
    `a=ssrc:${stream.ssrc} msid:${stream.streamId} ${stream.streamId}-audio`,
  ];
}

/**
 * Stateful per peer connection: unified plan never drops an m-section, so each
 * remote stream keeps the mid it got first and gone streams turn inactive.
 */
export class PlanBToUnifiedPlan {
  #midBySsrc = new Map<number, string>();

  /** The remote ssrc a converted m-section carries. */
  ssrcForMid(mid: string): number | null {
    for (const [ssrc, sectionMid] of this.#midBySsrc) {
      if (sectionMid === mid) return ssrc;
    }
    return null;
  }

  convert(sdp: string) {
    const { session, media } = splitSections(sdp);
    const [first, ...rest] = media;
    if (!first?.startsWith('m=audio')) return sdp;

    // without the mid header extension the browser routes incoming packets by ssrc
    const template = lines(first).filter(
      (line) => !line.includes(MID_EXTENSION) && !/^a=(ssrc|msid)/.test(line),
    );
    const mainMid =
      template.find((line) => line.startsWith('a=mid:'))?.slice(6) ?? '0';
    const peers = new Map(
      parseStreams(lines(first))
        .filter((stream) => !isOwnStream(stream))
        .map((stream) => [stream.ssrc, stream]),
    );
    for (const ssrc of peers.keys()) {
      if (!this.#midBySsrc.has(ssrc)) {
        this.#midBySsrc.set(ssrc, `${mainMid}-${this.#midBySsrc.size + 1}`);
      }
    }

    const peerSections = [...this.#midBySsrc].map(([ssrc, mid]) => {
      const stream = peers.get(ssrc);
      const base = template
        .filter(
          (line) => !/^a=(mid|sendrecv|sendonly|recvonly|inactive)/.test(line),
        )
        .concat(`a=mid:${mid}`, stream ? 'a=sendonly' : 'a=inactive');
      return stream ? base.concat(streamLines(stream)) : base;
    });

    const mids = [mainMid, ...this.#midBySsrc.values()];
    const sessionLines = lines(session).map((line) =>
      line.startsWith('a=group:BUNDLE')
        ? `a=group:BUNDLE ${mids.join(' ')}`
        : line,
    );

    // "-" is no stream: without any msid in a description, libwebrtc puts the main section's
    // track in a default stream it announces once but removes each time msid reappears
    // (a peer leaving then rejoining), which aborts react-native-webrtc on Android
    return `${[
      ...sessionLines,
      ...template,
      'a=msid:-',
      ...peerSections.flat(),
      ...rest.flatMap(lines),
    ].join('\r\n')}\r\n`;
  }
}
