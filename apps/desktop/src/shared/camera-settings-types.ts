export type CameraSettingValue = string | number | boolean;

/** How a change takes effect on the camera. */
export type CameraSettingEffect = 'live' | 'video-reload' | 'link-restart';

export interface CameraSettingsDevice {
  host: string;
  model: string;
  /** e.g. "V3.1", from the firmware's settings template. */
  firmware: string | null;
  /** RunCam re-applies the SD card's user.ini at every start, so it is written too. */
  sdCard: boolean;
  /** Firmware without wfb.yaml predates what ArduDeck can write safely. */
  readOnly: boolean;
}

export interface CameraSettingsSnapshot {
  device: CameraSettingsDevice;
  values: Record<string, CameraSettingValue>;
  /** Field id to the reason it cannot be changed on this unit. */
  unavailable: Record<string, string>;
}

export interface CameraSettingsLogin {
  host: string;
  username: string;
  password: string;
}

export type CameraSettingsResult =
  | { ok: true; snapshot: CameraSettingsSnapshot }
  | { ok: false; error: string };

export interface CameraSettingsApplyResult {
  ok: boolean;
  error?: string;
  /** Fields whose value read back differently after writing. */
  mismatched: string[];
  snapshot?: CameraSettingsSnapshot;
}

export interface CameraDiscoveryResult {
  /** needsLogin: a WiFiLink-like device that refused RunCam's default login. */
  cameras: { host: string; needsLogin: boolean }[];
  /** Wired adapters up with only a self-assigned 169.254 address. */
  unaddressedAdapters: string[];
}
