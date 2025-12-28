/**
 * Control vehicle tone generation (buzzer).
 * Message ID: 258
 * CRC Extra: 139
 */
export interface PlayTune {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** tune in board specific format */
  tune: string;
  /** tune extension (appended to tune) */
  tune2: string;
}

export const PLAY_TUNE_ID = 258;
export const PLAY_TUNE_CRC_EXTRA = 139;
export const PLAY_TUNE_MIN_LENGTH = 232;
export const PLAY_TUNE_MAX_LENGTH = 232;

export function serializePlayTune(msg: PlayTune): Uint8Array {
  const buffer = new Uint8Array(232);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // String: tune
  const tuneBytes = new TextEncoder().encode(msg.tune || '');
  buffer.set(tuneBytes.slice(0, 30), 2);
  // String: tune2
  const tune2Bytes = new TextEncoder().encode(msg.tune2 || '');
  buffer.set(tune2Bytes.slice(0, 200), 32);

  return buffer;
}

export function deserializePlayTune(payload: Uint8Array): PlayTune {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    tune: new TextDecoder().decode(payload.slice(2, 32)).replace(/\0.*$/, ''),
    tune2: new TextDecoder().decode(payload.slice(32, 232)).replace(/\0.*$/, ''),
  };
}