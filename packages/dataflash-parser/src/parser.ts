import { decodeField, fieldSize } from './field-types.js';
import type {
  FMTMessage,
  DataFlashMessage,
  DataFlashLog,
  DataFlashStreamParser,
  LogMetadata,
} from './types.js';

const HEADER_BYTE_1 = 0xA3;
const HEADER_BYTE_2 = 0x95;
const FMT_TYPE_ID = 128;
const FMT_MSG_LENGTH = 89; // 3 header + 86 payload

/** Parse a single message payload given its FMT definition */
function parseMessage(
  fmt: FMTMessage,
  payload: DataView,
): DataFlashMessage {
  const fields: Record<string, number | string> = {};
  let offset = 0;
  let timeUs = 0;

  for (let i = 0; i < fmt.fields.length && i < fmt.format.length; i++) {
    const typeChar = fmt.format[i]!;
    const fieldName = fmt.fields[i]!;
    const value = decodeField(typeChar, payload, offset);

    if (typeof value === 'object') {
      // int16[32] array — store as comma-separated string
      fields[fieldName] = (value as number[]).join(',');
    } else {
      fields[fieldName] = value;
    }

    // Track timestamp — first Q or q field named TimeUS
    if (i === 0 && (typeChar === 'Q' || typeChar === 'q') && fieldName === 'TimeUS') {
      timeUs = value as number;
    }

    offset += fieldSize(typeChar);
  }

  return { type: fmt.name, timeUs, fields };
}

/** Parse a FMT payload (type 128) into a FMTMessage */
function parseFmtPayload(payload: DataView): FMTMessage {
  const id = payload.getUint8(0);
  const length = payload.getUint8(1);

  const nameBytes = new Uint8Array(payload.buffer, payload.byteOffset + 2, 4);
  let nameEnd = nameBytes.indexOf(0);
  if (nameEnd === -1) nameEnd = 4;
  const name = new TextDecoder().decode(nameBytes.subarray(0, nameEnd));

  const fmtBytes = new Uint8Array(payload.buffer, payload.byteOffset + 6, 16);
  let fmtEnd = fmtBytes.indexOf(0);
  if (fmtEnd === -1) fmtEnd = 16;
  const format = new TextDecoder().decode(fmtBytes.subarray(0, fmtEnd));

  const labelBytes = new Uint8Array(payload.buffer, payload.byteOffset + 22, 64);
  let labelEnd = labelBytes.indexOf(0);
  if (labelEnd === -1) labelEnd = 64;
  const labels = new TextDecoder().decode(labelBytes.subarray(0, labelEnd));
  const fields = labels.split(',').filter(Boolean);

  return { id, name, length, format, fields };
}

export function createDataFlashParser(): DataFlashStreamParser {
  const formats = new Map<number, FMTMessage>();
  const messages = new Map<string, DataFlashMessage[]>();
  const metadata: LogMetadata = {
    vehicleType: '',
    firmwareVersion: '',
    firmwareString: '',
    boardType: '',
    gitHash: '',
  };
  let minTimeUs = Infinity;
  let maxTimeUs = 0;
  let consumed = 0;

  let buffer = new Uint8Array(0);

  function appendToBuffer(chunk: Uint8Array): void {
    const combined = new Uint8Array(buffer.length + chunk.length);
    combined.set(buffer, 0);
    combined.set(chunk, buffer.length);
    buffer = combined;
  }

  function extractMetadata(msg: DataFlashMessage): void {
    if (msg.type === 'MSG') {
      const text = String(msg.fields['Message'] ?? '');
      if (text.includes('Copter') || text.includes('Plane') ||
          text.includes('Rover') || text.includes('Sub')) {
        metadata.firmwareString = text;
        const verMatch = text.match(/V?(\d+\.\d+\.\d+)/);
        if (verMatch?.[1]) metadata.firmwareVersion = verMatch[1];
        if (text.includes('Copter')) metadata.vehicleType = 'copter';
        else if (text.includes('Plane')) metadata.vehicleType = 'plane';
        else if (text.includes('Rover')) metadata.vehicleType = 'rover';
        else if (text.includes('Sub')) metadata.vehicleType = 'sub';
      }
      if (text.includes('git hash')) {
        const hashMatch = text.match(/([0-9a-f]{8,})/i);
        if (hashMatch?.[1]) metadata.gitHash = hashMatch[1];
      }
    }
    if (msg.type === 'VER') {
      if (msg.fields['BT']) metadata.boardType = String(msg.fields['BT']);
      if (msg.fields['FWS']) metadata.firmwareString = String(msg.fields['FWS']);
      if (msg.fields['GH']) metadata.gitHash = String(msg.fields['GH']);
    }
  }

  function processBuffer(): DataFlashMessage[] {
    const parsed: DataFlashMessage[] = [];
    let pos = 0;

    while (pos < buffer.length) {
      if (buffer[pos] !== HEADER_BYTE_1 || buffer[pos + 1] !== HEADER_BYTE_2) {
        pos++;
        continue;
      }

      if (pos + 3 > buffer.length) break;

      const typeId = buffer[pos + 2]!;

      let msgLength: number;
      if (typeId === FMT_TYPE_ID) {
        msgLength = FMT_MSG_LENGTH;
      } else {
        const fmt = formats.get(typeId);
        if (!fmt) {
          pos++;
          continue;
        }
        msgLength = fmt.length;
      }

      if (pos + msgLength > buffer.length) break;

      const payloadStart = pos + 3;
      const payloadLength = msgLength - 3;
      const payloadView = new DataView(
        buffer.buffer,
        buffer.byteOffset + payloadStart,
        payloadLength,
      );

      if (typeId === FMT_TYPE_ID) {
        const fmt = parseFmtPayload(payloadView);
        formats.set(fmt.id, fmt);
      } else {
        const fmt = formats.get(typeId)!;
        const msg = parseMessage(fmt, payloadView);

        if (msg.timeUs > 0) {
          if (msg.timeUs < minTimeUs) minTimeUs = msg.timeUs;
          if (msg.timeUs > maxTimeUs) maxTimeUs = msg.timeUs;
        }

        extractMetadata(msg);

        let arr = messages.get(msg.type);
        if (!arr) {
          arr = [];
          messages.set(msg.type, arr);
        }
        arr.push(msg);
        parsed.push(msg);
      }

      pos += msgLength;
    }

    if (pos > 0) {
      buffer = buffer.slice(pos);
      consumed += pos;
    }

    return parsed;
  }

  return {
    get bytesConsumed() {
      return consumed;
    },

    feed(chunk: Uint8Array): DataFlashMessage[] {
      appendToBuffer(chunk);
      return processBuffer();
    },

    finalize(): DataFlashLog {
      processBuffer();

      return {
        formats,
        messages,
        metadata,
        timeRange: {
          startUs: minTimeUs === Infinity ? 0 : minTimeUs,
          endUs: maxTimeUs,
        },
        messageTypes: Array.from(messages.keys()).sort(),
      };
    },
  };
}

/** Parse a complete DataFlash .bin file */
export function parseDataFlashLog(buffer: Uint8Array): DataFlashLog {
  const parser = createDataFlashParser();
  parser.feed(buffer);
  return parser.finalize();
}
