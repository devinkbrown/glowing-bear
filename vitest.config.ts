import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath, URL } from 'node:url';
import { realpathSync } from 'node:fs';

// Test config — jsdom for store/DOM-adjacent suites; pure protocol suites
// run fine under jsdom too. Solid plugin so .tsx under test transforms.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    conditions: ['development', 'browser'],
  },
  // A git-worktree's node_modules is a symlink into the main tree; Vite's default
  // fs.allow is rooted at the worktree, so it blocks the symlink's resolved real
  // path and every suite fails to load @testing-library/jest-dom. Allow the
  // resolved node_modules so worktree-isolated fleet workers can gate. In the main
  // tree realpath('node_modules') resolves to itself — harmless.
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        realpathSync('node_modules'),
      ],
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Heavy jsdom renders (scene backgrounds, PBKDF2, decode) cost ~0.5–1s each and
    // inflate 2.5–3.8x when the box is CPU-oversubscribed (parallel fleet gates), which
    // could push a test past vitest's 5s default and cause a false integrate revert.
    // A generous project-level ceiling makes the suite load-insensitive; a real value
    // regression still fails its assertion instantly, well under this bound.
    testTimeout: 20_000,
  },
});
