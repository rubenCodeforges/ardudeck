import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Packages that MUST be bundled (not externalized):
// - Workspace packages: use pnpm workspace:* protocol that doesn't exist at runtime
// - electron-store: depends on conf -> env-paths@3 + 10 other ESM-only transitive deps
//   that fail with ERR_MODULE_NOT_FOUND in packaged apps
const bundledPackages = [
  '@ardudeck/comms',
  '@ardudeck/mavlink-ts',
  '@ardudeck/msp-ts',
  '@ardudeck/stm32-dfu',
  'electron-store',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledPackages })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledPackages })],
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
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    plugins: [react()],
  },
});
