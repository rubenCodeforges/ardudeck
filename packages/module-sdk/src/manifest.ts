export type MountPointName = 'floatingOverlay' | 'cameraOverlay';
export type ModulePermission = 'pty' | 'filesystem' | 'network' | 'vault' | 'dronecan';

export interface ModuleManifest {
  manifestVersion: 1;
  slug: string;
  name: string;
  version: string;
  entry: { main?: string; renderer?: string };
  mountPoints?: MountPointName[];
  permissions?: ModulePermission[];
  minArduDeckVersion?: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SLUG_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const VALID_MOUNT_POINTS: MountPointName[] = ['floatingOverlay', 'cameraOverlay'];
const VALID_PERMISSIONS: ModulePermission[] = ['pty', 'filesystem', 'network', 'vault', 'dronecan'];

export type ParseResult =
  | { ok: true; manifest: ModuleManifest }
  | { ok: false; error: string };

export function parseModuleManifest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'manifest must be an object' };
  const m = raw as Record<string, unknown>;
  if (m.manifestVersion !== 1) return { ok: false, error: 'unsupported manifestVersion' };
  if (typeof m.slug !== 'string' || !SLUG_RE.test(m.slug)) return { ok: false, error: 'invalid slug' };
  if (typeof m.name !== 'string' || !m.name) return { ok: false, error: 'invalid name' };
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) return { ok: false, error: 'invalid version' };
  const entry = m.entry as Record<string, unknown> | undefined;
  if (!entry || typeof entry !== 'object') return { ok: false, error: 'entry required' };
  const hasMain = typeof entry.main === 'string';
  const hasRenderer = typeof entry.renderer === 'string';
  // Neither entry is allowed: a pure "activator" cargo ships no code and only
  // unlocks built-in features via the host's capability map (see README,
  // "Gating built-in features"). The loaders simply have nothing to load.
  if (entry.main !== undefined && !hasMain) return { ok: false, error: 'entry.main must be a string' };
  if (entry.renderer !== undefined && !hasRenderer) return { ok: false, error: 'entry.renderer must be a string' };
  const mountPoints = m.mountPoints as unknown;
  if (mountPoints !== undefined) {
    if (!Array.isArray(mountPoints)) return { ok: false, error: 'mountPoints must be array' };
    for (const mp of mountPoints) {
      if (!VALID_MOUNT_POINTS.includes(mp as MountPointName)) {
        return { ok: false, error: `invalid mount point: ${String(mp)}` };
      }
    }
  }
  const permissions = m.permissions as unknown;
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) return { ok: false, error: 'permissions must be array' };
    for (const p of permissions) {
      if (!VALID_PERMISSIONS.includes(p as ModulePermission)) {
        return { ok: false, error: `invalid permission: ${String(p)}` };
      }
    }
  }
  return { ok: true, manifest: m as unknown as ModuleManifest };
}
