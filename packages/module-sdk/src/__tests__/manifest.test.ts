import { describe, it, expect } from 'vitest';
import { parseModuleManifest } from '../manifest.js';

describe('parseModuleManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'ardudeck.internal.assistant',
      name: 'Assistant',
      version: '0.1.0',
      entry: { renderer: 'renderer.js' },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a manifest with permissions and mount points', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'a.b',
      name: 'x',
      version: '1.2.3',
      entry: { main: 'main.js', renderer: 'r.js' },
      mountPoints: ['floatingOverlay'],
      permissions: ['pty', 'filesystem'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing slug', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      name: 'x',
      version: '0.1.0',
      entry: {},
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-semver version', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'a.b',
      name: 'x',
      version: 'nope',
      entry: { renderer: 'r.js' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown manifestVersion', () => {
    const result = parseModuleManifest({
      manifestVersion: 2,
      slug: 'a.b',
      name: 'x',
      version: '0.1.0',
      entry: { renderer: 'r.js' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown mount point', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'a.b',
      name: 'x',
      version: '0.1.0',
      entry: { renderer: 'r.js' },
      mountPoints: ['nope'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown permission', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'a.b',
      name: 'x',
      version: '0.1.0',
      entry: { renderer: 'r.js' },
      permissions: ['nope'],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts an empty entry (pure activator cargo that only gates built-ins)', () => {
    const result = parseModuleManifest({
      manifestVersion: 1,
      slug: 'a.b',
      name: 'x',
      version: '0.1.0',
      entry: {},
    });
    expect(result.ok).toBe(true);
  });

  it('rejects bad slug format', () => {
    const cases = ['NoCapitals', 'no-dot', '.leading.dot', 'bad_underscore.pkg'];
    for (const slug of cases) {
      const result = parseModuleManifest({
        manifestVersion: 1,
        slug,
        name: 'x',
        version: '0.1.0',
        entry: { renderer: 'r.js' },
      });
      expect(result.ok, `slug "${slug}" should fail`).toBe(false);
    }
  });

  it('rejects non-object input', () => {
    expect(parseModuleManifest(null).ok).toBe(false);
    expect(parseModuleManifest('string').ok).toBe(false);
    expect(parseModuleManifest(42).ok).toBe(false);
  });
  it('accepts required cargo slugs and rejects bad ones', () => {
    const base = { manifestVersion: 1, slug: 'com.acme.station', name: 'x', version: '0.1.0', entry: {} };
    expect(parseModuleManifest({ ...base, requires: ['com.ardudeck.vault'] }).ok).toBe(true);
    expect(parseModuleManifest({ ...base, requires: 'com.ardudeck.vault' }).ok).toBe(false);
    expect(parseModuleManifest({ ...base, requires: ['Bad Slug'] }).ok).toBe(false);
    expect(parseModuleManifest({ ...base, requires: ['com.acme.station'] }).ok).toBe(false);
  });

  it('accepts the production permission', () => {
    const result = parseModuleManifest({
      manifestVersion: 1, slug: 'a.b', name: 'x', version: '0.1.0', entry: {}, permissions: ['production', 'vault'],
    });
    expect(result.ok).toBe(true);
  });
});
