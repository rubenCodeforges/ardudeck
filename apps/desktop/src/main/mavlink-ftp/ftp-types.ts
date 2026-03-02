/**
 * MAVLink FTP Protocol types and constants.
 * Based on: https://mavlink.io/en/services/ftp.html
 * Reference: MissionPlanner MAVFtp.cs
 */

// ─── FTP Opcodes ─────────────────────────────────────────────────────────────

/** FTP request/response opcodes */
export const FtpOpcode = {
  None: 0,
  TerminateSession: 1,
  ResetSessions: 2,
  ListDirectory: 3,
  OpenFileRO: 4,
  ReadFile: 5,
  CreateFile: 6,
  WriteFile: 7,
  RemoveFile: 8,
  CreateDirectory: 9,
  RemoveDirectory: 10,
  OpenFileWO: 11,
  TruncateFile: 12,
  Rename: 13,
  CalcFileCRC32: 14,
  BurstReadFile: 15,
  Ack: 128,
  Nak: 129,
} as const;

export type FtpOpcodeValue = (typeof FtpOpcode)[keyof typeof FtpOpcode];

// ─── FTP Error Codes ─────────────────────────────────────────────────────────

/** NAK error codes (data[0] in NAK response) */
export const FtpError = {
  None: 0,
  Fail: 1,
  FailErrno: 2,
  InvalidDataSize: 3,
  InvalidSession: 4,
  NoSessionsAvailable: 5,
  EOF: 6,
  UnknownCommand: 7,
  FileExists: 8,
  FileProtected: 9,
  FileNotFound: 10,
} as const;

export type FtpErrorValue = (typeof FtpError)[keyof typeof FtpError];

export const FTP_ERROR_NAMES: Record<number, string> = {
  [FtpError.None]: 'None',
  [FtpError.Fail]: 'Fail',
  [FtpError.FailErrno]: 'FailErrno',
  [FtpError.InvalidDataSize]: 'InvalidDataSize',
  [FtpError.InvalidSession]: 'InvalidSession',
  [FtpError.NoSessionsAvailable]: 'NoSessionsAvailable',
  [FtpError.EOF]: 'EOF',
  [FtpError.UnknownCommand]: 'UnknownCommand',
  [FtpError.FileExists]: 'FileExists',
  [FtpError.FileProtected]: 'FileProtected',
  [FtpError.FileNotFound]: 'FileNotFound',
};

// ─── FTP Payload Header ──────────────────────────────────────────────────────

/** Byte offsets within the 251-byte FTP payload */
export const FTP_HEADER = {
  SEQ_NUMBER: 0,     // uint16 LE
  SESSION: 2,        // uint8
  OPCODE: 3,         // uint8
  SIZE: 4,           // uint8
  REQ_OPCODE: 5,     // uint8
  BURST_COMPLETE: 6, // uint8
  PADDING: 7,        // uint8
  OFFSET: 8,         // uint32 LE
  DATA: 12,          // uint8[239]
} as const;

/** Maximum data bytes per FTP payload (251 - 12 byte header) */
export const FTP_MAX_DATA_LENGTH = 239;

/** Total FTP payload length inside FILE_TRANSFER_PROTOCOL message */
export const FTP_PAYLOAD_LENGTH = 251;

// ─── Parsed FTP Payload ──────────────────────────────────────────────────────

export interface FtpPayload {
  seqNumber: number;
  session: number;
  opcode: number;
  size: number;
  reqOpcode: number;
  burstComplete: number;
  offset: number;
  data: Uint8Array;
}

/** Build an FTP payload buffer from structured fields */
export function serializeFtpPayload(p: FtpPayload): Uint8Array {
  const buf = new Uint8Array(FTP_PAYLOAD_LENGTH);
  const view = new DataView(buf.buffer);

  view.setUint16(FTP_HEADER.SEQ_NUMBER, p.seqNumber, true);
  buf[FTP_HEADER.SESSION] = p.session;
  buf[FTP_HEADER.OPCODE] = p.opcode;
  buf[FTP_HEADER.SIZE] = p.size;
  buf[FTP_HEADER.REQ_OPCODE] = p.reqOpcode;
  buf[FTP_HEADER.BURST_COMPLETE] = p.burstComplete;
  buf[FTP_HEADER.PADDING] = 0;
  view.setUint32(FTP_HEADER.OFFSET, p.offset, true);

  // Copy data
  buf.set(p.data.subarray(0, Math.min(p.data.length, FTP_MAX_DATA_LENGTH)), FTP_HEADER.DATA);

  return buf;
}

/** Parse an FTP payload from raw 251-byte buffer */
export function parseFtpPayload(raw: Uint8Array): FtpPayload {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  return {
    seqNumber: view.getUint16(FTP_HEADER.SEQ_NUMBER, true),
    session: raw[FTP_HEADER.SESSION]!,
    opcode: raw[FTP_HEADER.OPCODE]!,
    size: raw[FTP_HEADER.SIZE]!,
    reqOpcode: raw[FTP_HEADER.REQ_OPCODE]!,
    burstComplete: raw[FTP_HEADER.BURST_COMPLETE]!,
    offset: view.getUint32(FTP_HEADER.OFFSET, true),
    data: raw.slice(FTP_HEADER.DATA, FTP_HEADER.DATA + FTP_MAX_DATA_LENGTH),
  };
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Default read size per FTP packet (matches Mission Planner's optimized size for param.pck) */
export const FTP_READ_SIZE = 110;

/** Timeout waiting for FTP response (ms) */
export const FTP_TIMEOUT_MS = 2000;

/** Timeout for burst read inactivity (ms) */
export const FTP_BURST_TIMEOUT_MS = 1500;

/** Max retries per operation */
export const FTP_MAX_RETRIES = 5;

/** Virtual file path for packed parameters */
export const PARAM_PCK_PATH = '@PARAM/param.pck';
