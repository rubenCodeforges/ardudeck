/**
 * ArduDeck OS desktop surfaces.
 *
 * Each GNOME workspace can show its own desktop, chosen by the user in the
 * desktop right-click menu or ArduDeck Settings and stored in GSettings
 * (org.gnome.shell.extensions.ardudeck-desktop workspace-desktops). This
 * module keeps one chrome-less window per workspace whose scene the app
 * renders (map, synthetic vision, or both), and follows the setting live.
 * The shell extension finds each window by its title and pins it to its
 * workspace beneath every other window.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';

export const SURFACE_TITLE_PREFIX = 'ArduDeck Desktop Surface'; // i18n-exempt: window identity the shell extension matches on
const SCHEMA = 'org.gnome.shell.extensions.ardudeck-desktop';
const KEY = 'workspace-desktops';

/** Scenes this app renders; 'instruments' and 'wallpaper' are drawn by the shell. */
export const APP_SCENES = new Set(['map-svt', 'map', 'svt']);

export interface SurfaceWindow {
  scene: string;
  close(): void;
}

export type CreateSurfaceWindow = (workspace: number, scene: string) => SurfaceWindow;

/** Parse GVariant text like `{'0': 'map-svt', '2': 'svt'}`. */
export function parseWorkspaceDesktops(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of text.matchAll(/'(\d+)':\s*'([\w-]+)'/g)) out.set(Number(m[1]), m[2]!);
  return out;
}

function readSetting(): Promise<Map<number, string>> {
  return new Promise((resolve) => {
    execFile('gsettings', ['get', SCHEMA, KEY], (err, stdout) => {
      resolve(err ? new Map([[0, 'map-svt']]) : parseWorkspaceDesktops(stdout));
    });
  });
}

export class DesktopSurfaces {
  private readonly windows = new Map<number, SurfaceWindow>();
  private monitor: ChildProcess | null = null;

  constructor(private readonly create: CreateSurfaceWindow) {}

  async start(): Promise<void> {
    await this.reconcile();
    // `gsettings monitor` prints a line on every change of the key.
    this.monitor = spawn('gsettings', ['monitor', SCHEMA, KEY], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.monitor.stdout?.on('data', () => void this.reconcile());
    this.monitor.on('error', () => { /* no gsettings: keep the initial layout */ });
  }

  stop(): void {
    this.monitor?.kill();
    this.monitor = null;
    for (const w of this.windows.values()) w.close();
    this.windows.clear();
  }

  private async reconcile(): Promise<void> {
    const wanted = await readSetting();
    for (const [ws, win] of this.windows) {
      const scene = wanted.get(ws);
      if (scene !== win.scene || !APP_SCENES.has(scene ?? '')) {
        win.close();
        this.windows.delete(ws);
      }
    }
    for (const [ws, scene] of wanted) {
      if (!APP_SCENES.has(scene) || this.windows.has(ws)) continue;
      this.windows.set(ws, this.create(ws, scene));
    }
  }
}
