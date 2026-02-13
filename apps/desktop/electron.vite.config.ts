import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Packages that MUST be bundled (not externalized):
// - Workspace packages: use pnpm workspace:* protocol that doesn't exist at runtime
// - electron-store: depends on conf -> env-paths@3 + 10 other ESM-only transitive deps
//   that fail with ERR_MODULE_NOT_FOUND in packaged apps
//
// Native modules that MUST stay external (contain .node binaries that can't be bundled):
// - serialport / @serialport/* : native serial port bindings (used by @ardudeck/comms)
// - usb : native USB access (used by @ardudeck/stm32-dfu)
const bundledPackages = [
  '@ardudeck/comms',
  '@ardudeck/mavlink-ts',
  '@ardudeck/msp-ts',
  '@ardudeck/stm32-dfu',
  'electron-store',
];

const nativeExternals = [
  'serialport',
  '@serialport/bindings-cpp',
  '@serialport/bindings-interface',
  '@serialport/parser-byte-length',
  '@serialport/parser-cctalk',
  '@serialport/parser-delimiter',
  '@serialport/parser-inter-byte-timeout',
  '@serialport/parser-readline',
  '@serialport/parser-regex',
  '@serialport/stream',
  'usb',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledPackages })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
        external: nativeExternals,
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
        external: nativeExternals,
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
