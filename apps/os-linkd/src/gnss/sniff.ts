import { MAVLinkParser, getAllMessageInfos } from '@ardudeck/mavlink-ts';
import { UbxParser, RtcmFramer } from '@ardudeck/vehicle-core';

export type StreamKind = 'mavlink' | 'ubx' | 'nmea' | 'rtcm' | 'silent' | 'unknown';

const NMEA_RE = /\$([A-Z]{2})([A-Z]{3}),([^*\r\n]*)\*([0-9A-F]{2})/g;

/** XOR checksum over the characters between '$' and '*'. */
export function nmeaChecksumOk(sentence: string): boolean {
  const star = sentence.lastIndexOf('*');
  if (!sentence.startsWith('$') || star < 0) return false;
  let sum = 0;
  for (let i = 1; i < star; i++) sum ^= sentence.charCodeAt(i);
  return sum === Number.parseInt(sentence.slice(star + 1, star + 3), 16);
}

/**
 * Passive protocol classifier: counts only checksum-valid frames, so a
 * device is never misread from noise. Listening is harmless to any device,
 * which is why the detector always sniffs before it sends anything.
 */
export class StreamSniffer {
  readonly counts = { mavlink: 0, ubx: 0, nmea: 0, rtcm: 0 };
  bytes = 0;
  private readonly mav = new MAVLinkParser();
  private readonly ubx = new UbxParser();
  private readonly rtcm = new RtcmFramer();
  private text = '';
  /** Last talker id seen in NMEA (GP, GN, GL...), handy for identifying receivers. */
  talker: string | null = null;

  constructor() {
    this.mav.registerMessages(getAllMessageInfos());
  }

  push(chunk: Uint8Array): void {
    this.bytes += chunk.length;
    this.mav.feed(chunk);
    for (let p = this.mav.parseNext(); p; p = this.mav.parseNext()) if (p.crcValidated) this.counts.mavlink++;
    this.counts.ubx += this.ubx.push(chunk).length;
    this.counts.rtcm += this.rtcm.push(chunk).length;
    // NMEA is ASCII; keep a short rolling text window.
    this.text = (this.text + Buffer.from(chunk).toString('latin1')).slice(-4096);
    let m: RegExpExecArray | null;
    NMEA_RE.lastIndex = 0;
    let lastEnd = 0;
    while ((m = NMEA_RE.exec(this.text))) {
      if (nmeaChecksumOk(m[0])) {
        this.counts.nmea++;
        this.talker = m[1]!;
      }
      lastEnd = NMEA_RE.lastIndex;
    }
    if (lastEnd) this.text = this.text.slice(lastEnd);
  }

  /** The dominant protocol, or 'silent' / 'unknown' when nothing valid was seen. */
  verdict(): StreamKind {
    if (this.bytes === 0) return 'silent';
    const { mavlink, ubx, nmea, rtcm } = this.counts;
    // A GNSS can carry RTCM too (a base); MAVLink wins only with no GNSS traffic.
    if (ubx + nmea > 0) return rtcm > nmea + ubx ? 'rtcm' : ubx >= nmea ? 'ubx' : 'nmea';
    if (rtcm > 0) return 'rtcm';
    if (mavlink > 0) return 'mavlink';
    return 'unknown';
  }
}
