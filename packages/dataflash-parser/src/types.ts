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

/** Complete parsed log */
export interface DataFlashLog {
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
