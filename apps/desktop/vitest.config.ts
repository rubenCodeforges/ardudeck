import { defineConfig, configDefaults } from 'vitest/config';

// Vitest does not pick up electron.vite.config.ts (not a vite.config.* name), so
// it runs with defaults. Those defaults do not exclude `out/`, the gitignored
// electron-vite build output, which contains stale compiled copies of the test
// files. Running them fails (they resolve fixtures/relative paths from the wrong
// root) and is pointless since the source tests already cover the same code.
export default defineConfig({
  test: {
    // Pre-bundle so react-i18next (hoisted to root) shares the app's React instead of a second copy.
    deps: { optimizer: { web: { enabled: true, include: ['react-i18next', 'react', 'react-dom'] } } },
    exclude: [...configDefaults.exclude, '**/out/**'],
    setupFiles: ['./src/test-setup-i18n.ts'],
    coverage: {
      // `all: true` (the default) makes coverage-v8 glob every source file via
      // test-exclude to report untested ones. That scan crashes on a transitive
      // dep clash: test-exclude pulls minimatch@10 (needs brace-expansion@5's
      // named `expand`) while its nested glob pulls minimatch@9 (needs
      // brace-expansion@2's default export); the hoisted brace-expansion@5 has no
      // `.default`, so getUntestedFiles throws `brace_expansion_1.default is not a
      // function` AFTER every test passes. No single brace-expansion version fixes
      // both, so we scope coverage to files the tests actually load, which skips
      // that glob entirely.
      all: false,
    },
  },
});
