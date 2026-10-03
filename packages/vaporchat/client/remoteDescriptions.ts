import type { WebRTCUpdateRemoteDescription } from '../protocol.ts';
import { PlanBToUnifiedPlan } from './planB.ts';
import { accountIdFromStreamId } from './sdp.ts';

interface RemoteDescriptionsOptions {
  /** tells steam an offer got applied */
  acknowledge: (version: string) => Promise<void>;
  /** applying an offer failed, the peer connection needs a rebuild */
  onFailure: (err: unknown) => void;
}

/**
 * Applies Steam's descriptions to one peer connection: its answer to our offer, then the
 * offers it sends whenever participants come and go. One instance per peer connection.
 */
export class RemoteDescriptions {
  #pc: RTCPeerConnection;
  #options: RemoteDescriptionsOptions;
  #planB = new PlanBToUnifiedPlan();
  #ssrcToAccountId = new Map<number, number>();
  #pending: WebRTCUpdateRemoteDescription | null = null;
  #applying = false;
  #answered = false;
  #closed = false;

  constructor(pc: RTCPeerConnection, options: RemoteDescriptionsOptions) {
    this.#pc = pc;
    this.#options = options;
  }

  async applyAnswer(sdp: string) {
    await this.#pc.setRemoteDescription({
      type: 'answer',
      sdp: this.#planB.convert(sdp),
    });
    this.#answered = true;
    void this.#drain();
  }

  /** Like the official client, only the newest update matters while one is being applied. */
  queue(update: WebRTCUpdateRemoteDescription) {
    if (this.#closed) return;
    this.#pending = update;
    void this.#drain();
  }

  close() {
    this.#closed = true;
    this.#pending = null;
  }

  /** Whose audio a remote track carries, from steam's stream ids or its ssrc mapping. */
  accountIdForTrack(event: RTCTrackEvent): number | null {
    for (const stream of event.streams) {
      const accountId = accountIdFromStreamId(stream.id);
      if (accountId !== null) return accountId;
    }
    const mid = event.transceiver.mid;
    const ssrc = mid === null ? null : this.#planB.ssrcForMid(mid);
    return ssrc === null ? null : (this.#ssrcToAccountId.get(ssrc) ?? null);
  }

  async #drain() {
    if (this.#applying || !this.#answered) return;
    this.#applying = true;
    try {
      while (this.#pending && !this.#closed) {
        const update = this.#pending;
        this.#pending = null;
        await this.#apply(update);
      }
    } catch (err) {
      if (!this.#closed) this.#options.onFailure(err);
    } finally {
      this.#applying = false;
    }
  }

  async #apply(update: WebRTCUpdateRemoteDescription) {
    this.#ssrcToAccountId = new Map(
      (update.ssrcs_to_accountids ?? []).map(({ ssrc, accountid }) => [
        ssrc,
        accountid,
      ]),
    );
    const description = JSON.parse(
      update.remote_description,
    ) as RTCSessionDescriptionInit;
    await this.#pc.setRemoteDescription({
      type: description.type,
      sdp: this.#planB.convert(description.sdp ?? ''),
    });
    if (description.type !== 'offer') return;
    // the answer never goes to steam, only the acknowledgement does
    await this.#pc.setLocalDescription(await this.#pc.createAnswer());
    await this.#options.acknowledge(update.remote_description_version);
  }
}
