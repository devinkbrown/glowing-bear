import { test, expect } from '@playwright/test';

// Critical flow: DarkBear boots to its pre-connect surface with a usable
// relay-login form.
//
// Observable success signal: the DarkBear brand shell paints, the app is in its
// disconnected "connect to your relay" state, and the relay-login form (host /
// port / TLS / password) is present and wired — the Connect button flips from
// disabled to enabled once host + password are supplied.
//
// Connection(s) exercised: NEITHER. This is deliberately relay-free and
// bridge-free (see the two-connection note in playwright.config.ts) — it needs
// no live WeeChat relay and no orochi bridge, so it is fully deterministic.
// On load the app's connect surface is shown by default: the store seeds
// activeModal='connect' and the disconnected-state policy keeps it open while
// there is no relay (src/state/ui.ts + connectModalPolicy.ts), so the full
// ConnectScreen is the first thing a fresh visitor sees. Everything below is
// asserted from the DOM (there is no window.__ dev store handle in DarkBear).

test.describe('connect entry surface', () => {
  test('boots to the connect screen and exposes a wired relay-login form', async ({ page }) => {
    await page.goto('/'); // baseURL already carries the /darkbear/ base

    // Shell mounted (not a blank #root): the DarkBear brand heading paints.
    await expect(page.getByRole('heading', { name: 'DarkBear', level: 1 })).toBeVisible();

    // Disconnected entry state — the connect surface identifies itself, and the
    // shell's underlying empty-state prompt is present behind the overlay.
    await expect(page.getByText('WeeChat Relay Client')).toBeVisible();
    await expect(
      page.getByText('Connect to your WeeChat relay to bring your buffers, channels, and DMs into orbit.'),
    ).toBeAttached();

    // Relay-login fields render and are editable. `exact` on the labels so
    // "Password" does not also match the "Show password" toggle's aria-label.
    const host = page.getByLabel('Hostname', { exact: true });
    const port = page.getByLabel('Port', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await expect(host).toBeVisible();
    await expect(port).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole('button', { name: 'TLS', exact: true })).toBeVisible();

    // Connect is guarded until host + password are supplied — proves the form is
    // actually wired to state, not static markup. Auto-retrying expect only.
    const connect = page.getByRole('button', { name: 'Connect', exact: true });
    await expect(connect).toBeDisabled();

    await host.fill('relay.example.test');
    await password.fill('correct horse battery staple');

    // Observable state change with no relay dialed and no network needed.
    await expect(connect).toBeEnabled();
  });
});
