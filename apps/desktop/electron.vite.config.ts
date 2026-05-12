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
    server: {
      // Windows: `localhost` often resolves to ::1 first while Vite binds IPv4 only,
      // causing ERR_CONNECTION_REFUSED when Electron loads the dev URL.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
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
