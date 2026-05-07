/**
 * Shared types for the Python Plugins subsystem.
 *
 * Plugins are folders under `<userData>/python-plugins/<slug>/` containing a
 * `plugin.json` manifest, an entrypoint Python file, and an optional
 * `requirements.txt`. Each plugin runs as a long-lived sidecar process
 * spoken to over JSON-RPC on stdio.
 */

/** Lifecycle states a plugin can be in, surfaced in the UI. */
export type PythonPluginStatus =
  /** Manifest discovered, venv not yet created. */
  | 'discovered'
  /** `python -m venv .venv` is running. */
  | 'creating-venv'
  /** `pip install -r requirements.txt` is running. */
  | 'installing'
  /** Venv ready, sidecar not started. */
  | 'ready'
  /** Sidecar process is starting. */
  | 'starting'
  /** Sidecar process running, JSON-RPC handshake completed. */
  | 'running'
  /** Sidecar exited cleanly. */
  | 'stopped'
  /** Something failed; see `error` on the descriptor. */
  | 'error';

export interface PythonInterpreterInfo {
  /** Absolute path to the python executable used at runtime. */
  path: string;
  /** Parsed semantic version (e.g. "3.11.5"). */
  version: string;
  /** Major.minor portion only, used for venv compatibility checks. */
  majorMinor: string;
  /** Where the interpreter was discovered (env, PATH, py launcher, ...). */
  source: 'env' | 'path' | 'py-launcher' | 'platform' | 'cached';
}

/** Optional UI metadata that lets a plugin register a dockview panel. */
export interface PythonPluginUiManifest {
  /** Stable id used for the dockview component. */
  panelId: string;
  /** Title shown in the panel tab. */
  title: string;
  /** Optional Lucide icon name to display next to the title. */
  icon?: string;
}

/** Capabilities a plugin asks for; renderer/main can gate features on this. */
export type PythonPluginCapability =
  | 'telemetry.subscribe'
  | 'mavlink.send'
  | 'ui.panel'
  | 'fs.userdata';

/** Parsed `plugin.json` shape. Extra fields are tolerated and dropped. */
export interface PythonPluginManifest {
  slug: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** Path (relative to plugin dir) to the python entrypoint module/file. */
  entry: string;
  /** Minimum Python version required, e.g. "3.10". */
  minPython?: string;
  capabilities?: PythonPluginCapability[];
  ui?: PythonPluginUiManifest;
}

/** Runtime descriptor sent to the renderer for each installed plugin. */
export interface PythonPluginDescriptor {
  slug: string;
  manifest: PythonPluginManifest;
  /** Absolute path to the plugin directory on disk. */
  installPath: string;
  /** Whether `requirements.txt` exists in the plugin folder. */
  hasRequirements: boolean;
  /** Whether a venv has already been created. */
  hasVenv: boolean;
  status: PythonPluginStatus;
  /** Last error message (only set when `status === 'error'`). */
  error?: string;
  /** Process id of the running sidecar, when applicable. */
  pid?: number;
}

/** Push payload for `python:plugin:log`. */
export interface PythonPluginLogEvent {
  slug: string;
  /** `info` for stdout, `warn`/`error` for stderr (best-effort severity). */
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
}

/** Push payload for `python:plugin:event` — plugin-defined events. */
export interface PythonPluginEvent {
  slug: string;
  /** Event name as emitted by the plugin's `emit("foo", ...)` call. */
  event: string;
  payload: unknown;
  timestamp: number;
}

/** Push payload for `python:plugin:install-progress`. */
export interface PythonPluginInstallProgress {
  slug: string;
  /** Phase of the install pipeline. */
  phase: 'venv' | 'pip' | 'done' | 'error';
  /** Free-form line of output from the running tool (for the log panel). */
  line?: string;
  /** Whether this is the final progress event for the operation. */
  finished: boolean;
  error?: string;
}

/** Push payload for `python:plugin:status`. */
export interface PythonPluginStatusEvent {
  slug: string;
  status: PythonPluginStatus;
  pid?: number;
  error?: string;
}

/** Result of `python:detect`. `null` on failure. */
export type PythonDetectResult =
  | { ok: true; interpreter: PythonInterpreterInfo }
  | { ok: false; error: string };

/** Generic JSON-safe RPC payload bounds; tightened on the SDK side. */
export type PythonRpcParams = Record<string, unknown> | unknown[] | undefined;
export type PythonRpcResult = unknown;
