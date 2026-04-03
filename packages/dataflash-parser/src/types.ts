/** FMT message — defines the schema for a message type */
export interface FMTMessage {
  id: number;
  name: string;
  length: number;
  format: string;     // type chars e.g. "QfffffffI"
  fields: string[];   // field names e.g. ["TimeUS", "Roll", "Pitch", ...]
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
