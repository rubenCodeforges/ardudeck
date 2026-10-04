// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const audioContexts = vi.fn();

beforeEach(() => {
  vi.resetModules();
  audioContexts.mockClear();
  delete (globalThis as { __adGreeted?: boolean }).__adGreeted;
  (globalThis as { __adAnnouncerTeardown?: () => void }).__adAnnouncerTeardown?.();
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    constructor() { audioContexts(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    decodeAudioData() { return Promise.reject(new Error('no audio in tests')); }
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8))));
});

async function boot(mutedOnDisk: boolean) {
  const { useSettingsStore } = await import('../stores/settings-store');
  const { initAnnouncer } = await import('./announcer');
  useSettingsStore.setState({ _isInitialized: false, voiceAlertsMuted: false });
  initAnnouncer();
  useSettingsStore.setState({ _isInitialized: true, voiceAlertsMuted: mutedOnDisk });
  await new Promise((r) => setTimeout(r, 0));
}

describe('welcome greeting', () => {
  it('stays silent when mute was saved, even though settings load after startup', async () => {
    await boot(true);
    expect(audioContexts).not.toHaveBeenCalled();
  });

  it('greets once settings say sound is on', async () => {
    await boot(false);
    expect(audioContexts).toHaveBeenCalled();
  });
});
