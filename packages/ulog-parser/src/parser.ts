import {
  primitiveSize,
  isPrimitive,
  decodePrimitive,
  decodeCharArray,
} from './field-types.js';
import type {
  FMTMessage,
  DataFlashMessage,
  DataFlashLog,
  DataFlashStreamParser,
  LogMetadata,
} from '@ardudeck/dataflash-parser';

// ULog magic: 'U' 'L' 'o' 'g' 0x01 0x12 0x35, then version (uint8) at offset 7,
// then uint64 LE timestamp at offset 8. Full header is 16 bytes.
const MAGIC = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35];
const HEADER_SIZE = 16;

// One field of a ULog message format: a primitive (or nested message) type, the
// field name, and an array length (1 for scalars). _padding fields are tracked
// so the byte offset stays aligned but are not emitted as output fields.
interface FieldDef {
  type: string;
  name: string;
  arrayLen: number;
  isPadding: boolean;
}

interface FormatDef {
  name: string;
  fields: FieldDef[];
}

interface Subscription {
  messageName: string;
  multiId: number;
  format: FormatDef | undefined;
  // Output key in the messages map (name, or name_N for multiId > 0).
  key: string;
}

function parseFormatString(def: string): FormatDef {
  // "message_name:field0;field1;...;" where each field is "type name".
  const colon = def.indexOf(':');
  const name = colon === -1 ? def : def.slice(0, colon);
  const body = colon === -1 ? '' : def.slice(colon + 1);

  const fields: FieldDef[] = [];
  for (const raw of body.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const space = part.indexOf(' ');
    if (space === -1) continue;
    let type = part.slice(0, space).trim();
    const fieldName = part.slice(space + 1).trim();

    let arrayLen = 1;
    const bracket = type.indexOf('[');
    if (bracket !== -1) {
      const close = type.indexOf(']', bracket);
      const n = parseInt(type.slice(bracket + 1, close), 10);
      arrayLen = Number.isFinite(n) && n > 0 ? n : 1;
      type = type.slice(0, bracket);
    }

    fields.push({
      type,
      name: fieldName,
      arrayLen,
      isPadding: fieldName.startsWith('_padding'),
    });
  }

  return { name, fields };
}

export function createUlogParser(): DataFlashStreamParser {
  // msg_id -> subscription established by 'A' messages.
  const subscriptions = new Map<number, Subscription>();
  // message name -> format from 'F' messages (used to resolve nested types too).
  const formatDefs = new Map<string, FormatDef>();
  // Output FMTMessage per msg_id, built lazily on first data record.
  const formats = new Map<number, FMTMessage>();
  const messages = new Map<string, DataFlashMessage[]>();
  const metadata: LogMetadata = {
    vehicleType: '',
    firmwareVersion: '',
    firmwareString: '',
    boardType: '',
    gitHash: '',
  };
  const skippedNestedTypes = new Set<string>();

  let minTimeUs = Infinity;
  let maxTimeUs = 0;
  let consumed = 0;
  let headerParsed = false;
  let headerValid = false;

  let buffer = new Uint8Array(0);

  function appendToBuffer(chunk: Uint8Array): void {
    const combined = new Uint8Array(buffer.length + chunk.length);
    combined.set(buffer, 0);
    combined.set(chunk, buffer.length);
    buffer = combined;
  }

  // Byte size of one element of a field type, resolving nested formats. Returns
  // 0 if the type is unknown (e.g. a nested format not yet seen).
  function elementSize(type: string): number {
    if (isPrimitive(type)) return primitiveSize(type);
    const nested = formatDefs.get(type);
    if (nested) return structSize(nested);
    return 0;
  }

  function structSize(fmt: FormatDef): number {
    let size = 0;
    for (const f of fmt.fields) {
      size += elementSize(f.type) * f.arrayLen;
    }
    return size;
  }

  // Decode one field into the flattened output map and return the number of
  // bytes consumed. Supports nested message types by recursive expansion with a
  // dotted prefix. char arrays decode to a single string value.
  function decodeFieldInto(
    field: FieldDef,
    prefix: string,
    view: DataView,
    offset: number,
    out: Record<string, number | string>,
  ): number {
    const outName = prefix + field.name;

    if (field.type === 'char' && field.arrayLen > 1) {
      if (!field.isPadding) {
        out[outName] = decodeCharArray(view, offset, field.arrayLen);
      }
      return field.arrayLen;
    }

    if (isPrimitive(field.type)) {
      const elemSize = primitiveSize(field.type);
      if (field.arrayLen === 1) {
        if (!field.isPadding) {
          out[outName] = decodePrimitive(field.type, view, offset);
        }
      } else {
        for (let i = 0; i < field.arrayLen; i++) {
          const value = decodePrimitive(field.type, view, offset + i * elemSize);
          if (!field.isPadding) out[`${outName}[${i}]`] = value;
        }
      }
      return elemSize * field.arrayLen;
    }

    // Nested message type. Expand one level (recursively) so embedded structs
    // appear as dotted/bracketed fields. If the nested format is unknown, skip
    // its bytes (size 0 means we cannot advance reliably) and record it.
    const nested = formatDefs.get(field.type);
    if (!nested) {
      skippedNestedTypes.add(field.type);
      return 0;
    }
    const oneSize = structSize(nested);
    if (field.arrayLen === 1) {
      decodeStructInto(nested, `${outName}.`, view, offset, field.isPadding, out);
    } else {
      for (let i = 0; i < field.arrayLen; i++) {
        decodeStructInto(
          nested,
          `${outName}[${i}].`,
          view,
          offset + i * oneSize,
          field.isPadding,
          out,
        );
      }
    }
    return oneSize * field.arrayLen;
  }

  function decodeStructInto(
    fmt: FormatDef,
    prefix: string,
    view: DataView,
    startOffset: number,
    suppress: boolean,
    out: Record<string, number | string>,
  ): void {
    let offset = startOffset;
    for (const field of fmt.fields) {
      const effective = suppress ? { ...field, isPadding: true } : field;
      offset += decodeFieldInto(effective, prefix, view, offset, out);
    }
  }

  // Flattened output field names for a format (excludes padding). Built once per
  // subscription for the FMTMessage.fields list.
  function outputFieldNames(fmt: FormatDef, prefix: string): string[] {
    const names: string[] = [];
    for (const field of fmt.fields) {
      if (field.isPadding) continue;
      const outName = prefix + field.name;
      if (field.type === 'char' && field.arrayLen > 1) {
        names.push(outName);
        continue;
      }
      if (isPrimitive(field.type)) {
        if (field.arrayLen === 1) {
          names.push(outName);
        } else {
          for (let i = 0; i < field.arrayLen; i++) names.push(`${outName}[${i}]`);
        }
        continue;
      }
      const nested = formatDefs.get(field.type);
      if (!nested) continue;
      if (field.arrayLen === 1) {
        names.push(...outputFieldNames(nested, `${outName}.`));
      } else {
        for (let i = 0; i < field.arrayLen; i++) {
          names.push(...outputFieldNames(nested, `${outName}[${i}].`));
        }
      }
    }
    return names;
  }

  function applyInfo(key: string, value: string): void {
    // ver_sw / ver_sw_release carry firmware version; sys_name the autopilot
    // family; ver_hw the board. Best-effort population of LogMetadata.
    if (key === 'sys_name') {
      metadata.firmwareString = metadata.firmwareString
        ? `${value} ${metadata.firmwareString}`
        : value;
    } else if (key === 'ver_sw') {
      metadata.gitHash = value;
    } else if (key === 'ver_sw_release') {
      metadata.firmwareVersion = value;
      if (!metadata.firmwareString.includes(value)) {
        metadata.firmwareString = metadata.firmwareString
          ? `${metadata.firmwareString} ${value}`
          : value;
      }
    } else if (key === 'ver_hw') {
      metadata.boardType = value;
      // ver_hw often signals the vehicle family in practice (e.g. SITL builds).
      const lower = value.toLowerCase();
      if (!metadata.vehicleType) {
        if (lower.includes('quad') || lower.includes('copter')) metadata.vehicleType = 'copter';
        else if (lower.includes('plane') || lower.includes('wing')) metadata.vehicleType = 'plane';
        else if (lower.includes('rover')) metadata.vehicleType = 'rover';
        else if (lower.includes('vtol')) metadata.vehicleType = 'vtol';
      }
    } else if (key === 'sys_mc_ver' && !metadata.gitHash) {
      metadata.gitHash = value;
    }
  }

  // Parse an 'I'/'P' style key "type key_name" plus value bytes. Returns the
  // decoded value plus the field name. Used by info and parameter handlers.
  function parseKeyedValue(
    payload: DataView,
    bodyStart: number,
  ): { name: string; value: number | string } | undefined {
    if (bodyStart >= payload.byteLength) return undefined;
    const keyLen = payload.getUint8(bodyStart);
    const keyStart = bodyStart + 1;
    if (keyStart + keyLen > payload.byteLength) return undefined;
    const keyStr = decodeCharArray(payload, keyStart, keyLen);
    const valueStart = keyStart + keyLen;

    const space = keyStr.indexOf(' ');
    if (space === -1) return undefined;
    let type = keyStr.slice(0, space).trim();
    const name = keyStr.slice(space + 1).trim();

    let arrayLen = 1;
    const bracket = type.indexOf('[');
    if (bracket !== -1) {
      const close = type.indexOf(']', bracket);
      const n = parseInt(type.slice(bracket + 1, close), 10);
      arrayLen = Number.isFinite(n) && n > 0 ? n : 1;
      type = type.slice(0, bracket);
    }

    if (type === 'char') {
      const len = valueStart + arrayLen <= payload.byteLength
        ? arrayLen
        : payload.byteLength - valueStart;
      return { name, value: decodeCharArray(payload, valueStart, len) };
    }
    if (isPrimitive(type)) {
      if (valueStart + primitiveSize(type) > payload.byteLength) return undefined;
      return { name, value: decodePrimitive(type, payload, valueStart) };
    }
    return undefined;
  }

  function pushMessage(key: string, msg: DataFlashMessage): void {
    let arr = messages.get(key);
    if (!arr) {
      arr = [];
      messages.set(key, arr);
    }
    arr.push(msg);
  }

  function handleData(payload: DataView): DataFlashMessage | undefined {
    if (payload.byteLength < 2) return undefined;
    const msgId = payload.getUint16(0, true);
    const sub = subscriptions.get(msgId);
    if (!sub || !sub.format) return undefined;

    const structView = new DataView(
      payload.buffer,
      payload.byteOffset + 2,
      payload.byteLength - 2,
    );

    const fields: Record<string, number | string> = {};
    decodeStructInto(sub.format, '', structView, 0, false, fields);

    // First field is uint64 timestamp by PX4 convention.
    let timeUs = 0;
    const first = sub.format.fields[0];
    if (first && first.type === 'uint64_t' && first.name === 'timestamp') {
      const t = fields['timestamp'];
      if (typeof t === 'number') timeUs = t;
    }

    if (timeUs > 0) {
      if (timeUs < minTimeUs) minTimeUs = timeUs;
      if (timeUs > maxTimeUs) maxTimeUs = timeUs;
    }

    // Lazily register the FMTMessage on first data record for this msg_id.
    if (!formats.has(msgId)) {
      formats.set(msgId, {
        id: msgId,
        name: sub.key,
        length: structSize(sub.format),
        format: '',
        fields: outputFieldNames(sub.format, ''),
      });
    }

    const msg: DataFlashMessage = { type: sub.key, timeUs, fields };
    pushMessage(sub.key, msg);
    return msg;
  }

  function handleAddLogged(payload: DataView): void {
    if (payload.byteLength < 3) return;
    const multiId = payload.getUint8(0);
    const msgId = payload.getUint16(1, true);
    const name = decodeCharArray(payload, 3, payload.byteLength - 3);
    const key = multiId > 0 ? `${name}_${multiId}` : name;
    subscriptions.set(msgId, {
      messageName: name,
      multiId,
      format: formatDefs.get(name),
      key,
    });
  }

  function handleInfo(payload: DataView, bodyStart: number): void {
    const parsed = parseKeyedValue(payload, bodyStart);
    if (parsed) applyInfo(parsed.name, String(parsed.value));
  }

  function handleParam(payload: DataView, bodyStart: number): void {
    const parsed = parseKeyedValue(payload, bodyStart);
    if (!parsed || typeof parsed.value !== 'number') return;
    pushMessage('PARM', {
      type: 'PARM',
      timeUs: 0,
      fields: { Name: parsed.name, Value: parsed.value },
    });
  }

  function handleLoggedString(payload: DataView, hasTag: boolean): void {
    if (payload.byteLength < 1) return;
    const level = payload.getUint8(0);
    let offset = 1;
    if (hasTag) offset += 2; // uint16 tag for 'C'
    if (offset + 8 > payload.byteLength) return;
    const lo = payload.getUint32(offset, true);
    const hi = payload.getUint32(offset + 4, true);
    const timeUs = hi * 0x100000000 + lo;
    offset += 8;
    const text = decodeCharArray(payload, offset, payload.byteLength - offset);
    pushMessage('LOGGED_STRING', {
      type: 'LOGGED_STRING',
      timeUs,
      fields: { Level: level, Message: text },
    });
  }

  function tryParseHeader(): boolean {
    if (buffer.length < HEADER_SIZE) return false;
    headerParsed = true;
    for (let i = 0; i < MAGIC.length; i++) {
      if (buffer[i] !== MAGIC[i]) {
        headerValid = false;
        return true;
      }
    }
    headerValid = true;
    buffer = buffer.slice(HEADER_SIZE);
    consumed += HEADER_SIZE;
    return true;
  }

  function processBuffer(): DataFlashMessage[] {
    const parsed: DataFlashMessage[] = [];

    if (!headerParsed) {
      if (!tryParseHeader()) return parsed;
      if (!headerValid) return parsed;
    }
    if (!headerValid) return parsed;

    let pos = 0;
    while (pos + 3 <= buffer.length) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + pos, 3);
      const msgSize = view.getUint16(0, true);
      const msgType = String.fromCharCode(view.getUint8(2));
      const payloadStart = pos + 3;
      if (payloadStart + msgSize > buffer.length) break;

      const payload = new DataView(
        buffer.buffer,
        buffer.byteOffset + payloadStart,
        msgSize,
      );

      switch (msgType) {
        case 'F': {
          const def = parseFormatString(decodeCharArray(payload, 0, msgSize));
          formatDefs.set(def.name, def);
          break;
        }
        case 'A':
          handleAddLogged(payload);
          break;
        case 'D': {
          const msg = handleData(payload);
          if (msg) parsed.push(msg);
          break;
        }
        case 'I':
          handleInfo(payload, 0);
          break;
        case 'M':
          handleInfo(payload, 1); // skip uint8 is_continued
          break;
        case 'P':
          handleParam(payload, 0);
          break;
        case 'Q':
          handleParam(payload, 1); // skip uint8 default_types
          break;
        case 'L':
          handleLoggedString(payload, false);
          break;
        case 'C':
          handleLoggedString(payload, true);
          break;
        // 'B' flag bits, 'R' remove, 'S' sync, 'O' dropout: consumed, no action.
        default:
          break;
      }

      pos = payloadStart + msgSize;
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

      if (skippedNestedTypes.size > 0) {
        console.warn(
          `[ulog-parser] skipped unknown nested types: ${Array.from(skippedNestedTypes).join(', ')}`,
        );
      }

      return {
        format: 'ulog',
        formats,
        messages,
        metadata,
        timeRange: {
          startUs: minTimeUs === Infinity ? 0 : minTimeUs,
          endUs: maxTimeUs,
        },
        messageTypes: Array.from(messages.keys()).sort(),
        unitLabels: new Map(),
        multValues: new Map(),
      };
    },
  };
}

/** Parse a complete PX4 ULog .ulg file. */
export function parseUlog(buffer: Uint8Array): DataFlashLog {
  const parser = createUlogParser();
  parser.feed(buffer);
  return parser.finalize();
}
