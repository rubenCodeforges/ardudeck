import { describe, expect, it } from 'vitest';
import { runnableHere } from './app-manager';
import type { HangarApp } from '../../shared/app-types';

const app = (slug: string, platforms: HangarApp['platforms']): HangarApp => ({
  slug,
  name: slug,
  description: null,
  authorName: 'ArduDeck',
  category: 'Software',
  iconUrl: null,
  downloads: 0,
  latestVersion: '0.1.0',
  platforms,
  sizes: {},
  standalone: true,
  insideArduDeck: true,
});

describe('runnableHere', () => {
  it('keeps an app that published this platform', () => {
    const out = runnableHere([app('trainer', ['darwin', 'win32', 'linux'])], 'darwin');
    expect(out.map((a) => a.slug)).toEqual(['trainer']);
  });

  it('drops an app that did not', () => {
    expect(runnableHere([app('linux-only', ['linux'])], 'darwin')).toEqual([]);
  });

  // The case this exists for: a release where one platform's build failed. `platforms` is read
  // off the rows that exist, so the two that shipped are offered and the third is not - rather
  // than every platform getting an Install button and one of them getting a 404.
  it('offers a partial release only where it actually built', () => {
    const partial = [app('trainer', ['darwin', 'linux'])];
    expect(runnableHere(partial, 'linux')).toHaveLength(1);
    expect(runnableHere(partial, 'win32')).toHaveLength(0);
  });
});
