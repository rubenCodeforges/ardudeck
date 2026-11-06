/** FMT message — defines the schema for a message type */
export interface FMTMessage {
  id: number;
  name: string;
  length: number;
  format: string;     // type chars e.g. "QfffffffI"
  fields: string[];   // field names e.g. ["TimeUS", "Roll", "Pitch", ...]
  /** Per-field unit char from FMTU.UnitIds. '-' means no unit. Populated only
   *  when the log contains FMTU messages (newer ArduPilot firmware). */
  unitChars?: string[];
  /** Per-field multiplier char from FMTU.MultIds. '-' means no multiplier. */
  multChars?: string[];
}

/** A single parsed log message */
export interface DataFlashMessage {
  type: string;
  timeUs: number;
  fields: Record<string, number | string>;
}

/** Metadata extracted from MSG/VER/PARM messages */
export interface LogMetadata {
  vehicleType: string;
  firmwareVersion: string;
  firmwareString: string;
  boardType: string;
  gitHash: string;
}

/** One message type as columns: a typed array per numeric field, strings as arrays. */
export interface MessageColumns {
  count: number;
  timeUs: Float64Array;
  num: Record<string, Float64Array>;
  txt: Record<string, string[]>;
}

export interface DataFlashParserOptions {
  /**
   * Store every message type as columns while parsing instead of one object per
   * record. A big log is millions of records, and one object each is gigabytes of heap.
   */
  columnar?: boolean;
  /** With `columnar`: the types that also keep row objects in `messages` (what health checks and summaries read). */
  keepRows?: ReadonlySet<string>;
}

/** Complete parsed log */
export interface DataFlashLog {
  /** Which parser produced this log. 'dataflash' for ArduPilot .bin (this
   *  package), 'ulog' for PX4 .ulg (the @ardudeck/ulog-parser package). */
  format: 'dataflash' | 'ulog';
  formats: Map<number, FMTMessage>;
  messages: Map<string, DataFlashMessage[]>;
  metadata: LogMetadata;
  timeRange: { startUs: number; endUs: number };
  /** All unique message type names found */
  messageTypes: string[];
  /** Unit char → human label, e.g. 'm' → "m", 'd' → "deg". Sourced from UNIT
   *  records. Empty when the log has no UNIT/FMTU records (older firmware). */
  unitLabels: Map<string, string>;
  /** Multiplier char → numeric multiplier. Sourced from MULT records. */
  multValues: Map<string, number>;
  /** Every message type as columns; only when parsed with `columnar`, and then `messages` holds just the `keepRows` types. */
  columns?: Map<string, MessageColumns>;
}

/** Streaming parser interface */
export interface DataFlashStreamParser {
  /** Feed a chunk of binary data, returns any fully parsed messages */
  feed(chunk: Uint8Array): DataFlashMessage[];
  /** Get the final parsed log after all data is fed */
  finalize(): DataFlashLog;
  /** Get parse progress as bytes consumed */
  bytesConsumed: number;
}
