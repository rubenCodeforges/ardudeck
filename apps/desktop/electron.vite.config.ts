import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-store must be bundled: it depends on conf -> env-paths@3 + 10 other
// ESM-only transitive deps that fail with ERR_MODULE_NOT_FOUND in packaged apps.
// Everything else (workspace packages, native modules) is handled correctly by
// externalizeDepsPlugin + electron-builder.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@ardudeck/dataflash-parser', '@ardudeck/module-sdk'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Log parsing runs in a worker thread: a 200 MB dataflash file takes
          // many seconds to decode, and on the main thread that stalls IPC,
          // every window AND the MAVLink link.
          'log-worker': resolve(__dirname, 'src/main/log-worker.ts'),
        },
        output: {
          // electron-vite's ESM shim finds the "last import" with a regex that also matches inside
          // string literals (any translation ending in "import"). Locale data in its own chunk has
          // no require/__dirname, so the shim never touches it.
          manualChunks: (id) => (id.includes('/shared/i18n/locales/') ? 'locales' : undefined),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@ardudeck/module-sdk'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    // lets the main process read a frozen page's JavaScript stack in development
    server: { headers: { 'Document-Policy': 'include-js-call-stacks-in-crash-reports' } },
    // apps/desktop/node_modules keeps isolated-linker symlinks while react-i18next is hoisted to the
    // root; without dedupe the renderer bundles two Reacts and every hook throws.
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
    plugins: [react()],
  },
});
