import { defineConfig, devices } from '@playwright/test';

// DarkBear end-to-end harness.
//
// SAFETY: drive the DEV server only — never a production `pnpm build`. `out/` is
// served LIVE at /darkbear/ by nginx (deploy.sh does no copy step), so a stray
// build during an e2e run would overwrite production. `pnpm dev` serves the same
// SPA under the Vite base with source maps and dev conditions.
//
// THE TWO-CONNECTION REALITY (load-bearing for every future spec):
//   (1) the WeeChat binary relay WS — the chat backbone (buffers, history,
//       nicklists, hotlist). A connect / buffer-join / send / per-buffer-search
//       flow needs only THIS wire up.
//   (2) the direct orochi bridge WS (opt-in: Settings -> Connection -> Bridge) —
//       carries voice/video media, typing, reactions, read-markers, and E2EE DMs.
//       A media or E2EE-DM flow must bring the BRIDGE up too; the relay alone
//       does not carry them. Assert against the wire the flow actually uses.
// This entry spec exercises NEITHER wire — it asserts the pre-connect surface.

const PORT = 5173;
const BASE = '/darkbear/';
const APP_URL = `http://localhost:${PORT}${BASE}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: APP_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Fake-media flags so future connected voice/video specs can self-launch the
    // full chromium binary with a synthetic mic/cam. Harmless for chat/entry.
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Auto-start the DEV server (never a build). Reuse an already-running dev
  // server locally so a foreground `pnpm dev` is picked up instead of re-spawned.
  webServer: {
    command: 'pnpm dev',
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
