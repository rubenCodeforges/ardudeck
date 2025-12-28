/**
 * Information about a storage medium. This message is sent in response to a request with MAV_CMD_REQUEST_MESSAGE and whenever the status of the storage changes (STORAGE_STATUS). Use MAV_CMD_REQUEST_MESSAGE.param2 to indicate the index/id of requested storage: 0 for all, 1 for first, 2 for second, etc.
 * Message ID: 261
 * CRC Extra: 114
 */
export interface StorageInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Storage ID (1 for first, 2 for second, etc.) */
  storageId: number;
  /** Number of storage devices */
  storageCount: number;
  /** Status of storage */
  status: number;
  /** Total capacity. If storage is not ready (STORAGE_STATUS_READY) value will be ignored. (MiB) */
  totalCapacity: number;
  /** Used capacity. If storage is not ready (STORAGE_STATUS_READY) value will be ignored. (MiB) */
  usedCapacity: number;
  /** Available storage capacity. If storage is not ready (STORAGE_STATUS_READY) value will be ignored. (MiB) */
  availableCapacity: number;
  /** Read speed. (MiB/s) */
  readSpeed: number;
  /** Write speed. (MiB/s) */
  writeSpeed: number;
  /** Type of storage */
  type: number;
  /** Textual storage name to be used in UI (microSD 1, Internal Memory, etc.) This is a NULL terminated string. If it is exactly 32 characters long, add a terminating NULL. If this string is empty, the generic type is shown to the user. */
  name: string;
}

export const STORAGE_INFORMATION_ID = 261;
export const STORAGE_INFORMATION_CRC_EXTRA = 114;
export const STORAGE_INFORMATION_MIN_LENGTH = 60;
export const STORAGE_INFORMATION_MAX_LENGTH = 60;

export function serializeStorageInformation(msg: StorageInformation): Uint8Array {
  const buffer = new Uint8Array(60);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.totalCapacity, true);
  view.setFloat32(8, msg.usedCapacity, true);
  view.setFloat32(12, msg.availableCapacity, true);
  view.setFloat32(16, msg.readSpeed, true);
  view.setFloat32(20, msg.writeSpeed, true);
  buffer[24] = msg.storageId & 0xff;
  buffer[25] = msg.storageCount & 0xff;
  buffer[26] = msg.status & 0xff;
  buffer[27] = msg.type & 0xff;
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 32), 28);

  return buffer;
}

export function deserializeStorageInformation(payload: Uint8Array): StorageInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    totalCapacity: view.getFloat32(4, true),
    usedCapacity: view.getFloat32(8, true),
    availableCapacity: view.getFloat32(12, true),
    readSpeed: view.getFloat32(16, true),
    writeSpeed: view.getFloat32(20, true),
    storageId: payload[24],
    storageCount: payload[25],
    status: payload[26],
    type: payload[27],
    name: new TextDecoder().decode(payload.slice(28, 60)).replace(/\0.*$/, ''),
  };
}