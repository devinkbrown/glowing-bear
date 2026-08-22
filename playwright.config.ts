import { defineConfig, devices } from '@playwright/test';

// DarkBear end-to-end harness.
//
// SAFETY: drive the DEV server only. Production nginx serves the versioned
// release selected by current/; deploy.sh is the only supported way to move
// that pointer. `pnpm dev` serves the same SPA under the Vite base with source
// maps and dev conditions.
//
// THE TWO-CONNECTION REALITY (load-bearing for every future spec):
//   (1) the WeeChat binary relay WS — the chat backbone (buffers, history,
//       nicklists, hotlist). A connect / buffer-join / send / per-buffer-search
//       flow needs only THIS wire up.
//   (2) the direct Onyx Server bridge WS (opt-in: Settings -> Connection -> Bridge) —
//       carries voice/video media, typing, reactions, read-markers, and E2EE DMs.
//       A media or E2EE-DM flow must bring the BRIDGE up too; the relay alone
//       does not carry them. Assert against the wire the flow actually uses.
// This entry spec exercises NEITHER wire — it asserts the pre-connect surface.

const PORT = 5173;
const BASE = '/darkbear/';
const APP_URL = `http://localhost:${PORT}${BASE}`;
const chromiumMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];

export default defineConfig({
  testDir: './tests/e2e',
  // WebKit can run 3–4x slower after the full codec/archive matrix has warmed
  // the single CI worker. Keep each assertion's narrow timeout as the actual
  // regression signal, while giving complete multi-step journeys room to finish.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: APP_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumMediaArgs } },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Keep WebKit deterministic across the full codec/archive matrix by
    // exercising the shipped reduced-motion path. Desktop Chromium and
    // Firefox retain normal-motion coverage, while WebKit avoids accumulating
    // expensive SMIL and scene-compositor work until unrelated controls never
    // become stable.
    { name: 'webkit', use: { ...devices['Desktop Safari'], reducedMotion: 'reduce' } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], launchOptions: { args: chromiumMediaArgs } },
    },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'], reducedMotion: 'reduce' } },
  ],
  // Auto-start the DEV server (never a build). Reuse an already-running dev
  // server locally so a foreground `pnpm dev` is picked up instead of re-spawned.
  webServer: {
    command: 'pnpm dev',
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
