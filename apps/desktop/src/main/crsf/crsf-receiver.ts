/**
 * Byte-stream side of a CRSF telemetry link: buffer, frame, decode, age out.
 *
 * Datagram boundaries mean nothing to CRSF, so a frame can be split across two
 * UDP packets and a packet can hold several frames. The tail is kept until it
 * completes and capped so a stream of junk cannot grow it without bound.
 */

import { extractCrsfFrames } from '../link-doctor/crsf-protocol.js';
import {
  applyCrsfFrame,
  createCrsfState,
  crsfBatch,
  linkSummary,
  type CrsfBatch,
  type CrsfTelemetryState,
} from './crsf-telemetry.js';

const MAX_TAIL_BYTES = 4096;
const KEEP_TAIL_BYTES = 256;

/** How long without a telemetry frame before the aircraft counts as gone. */
export const CRSF_STALE_MS = 3000;

export class CrsfReceiver {
  private rx = new Uint8Array(0);
  readonly state: CrsfTelemetryState = createCrsfState();

  /** Returns how many telemetry frames this chunk contributed. */
  feed(chunk: Uint8Array, atMs: number): number {
    const merged = new Uint8Array(this.rx.length + chunk.length);
    merged.set(this.rx);
    merged.set(chunk, this.rx.length);

    const { frames, consumed } = extractCrsfFrames(merged);
    let decoded = 0;
    for (const frame of frames) {
      if (applyCrsfFrame(this.state, frame, atMs)) decoded++;
    }

    this.rx = merged.slice(consumed);
    if (this.rx.length > MAX_TAIL_BYTES) this.rx = this.rx.slice(-KEEP_TAIL_BYTES);
    return decoded;
  }

  /** True once the aircraft (not just the transmitter) has said something. */
  get hasTelemetry(): boolean {
    return this.state.lastFrameAtMs > 0;
  }

  isStale(atMs: number, timeoutMs = CRSF_STALE_MS): boolean {
    if (!this.hasTelemetry) return true;
    return atMs - this.state.lastFrameAtMs > timeoutMs;
  }

  batch(): CrsfBatch {
    return crsfBatch(this.state);
  }

  /** Link quality line for the log, or null while the radio has said nothing. */
  linkLine(): string | null {
    return this.state.link ? linkSummary(this.state.link) : null;
  }
}
