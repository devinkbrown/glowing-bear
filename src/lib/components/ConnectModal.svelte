<script lang="ts">
  import { chat } from '$lib/stores/chat.svelte.js';
  import { settings } from '$lib/stores/settings.svelte.js';
  import { ConnectionState } from '$lib/weechat/types.js';
  import BearLogo from './BearLogo.svelte';

  interface Props {
    onclose?: () => void;
  }

  const { onclose }: Props = $props();

  let host     = $state(settings.relay.host);
  let port     = $state(settings.relay.port);
  let tls      = $state(settings.relay.tls);
  let password = $state(settings.relay.password);
  let compression = $state(settings.relay.compression);
  let totp     = $state('');
  let useTotp  = $state(false);
  let profileName = $state('');
  let showSaveProfile = $state(false);

  const connecting = $derived(
    chat.connectionState === ConnectionState.CONNECTING ||
    chat.connectionState === ConnectionState.AUTHENTICATING
  );

  function connect() {
    const fullPassword = useTotp && totp.trim() ? `${password}${totp.trim()}` : password;
    settings.relay = { host, port, tls, password, compression };
    settings.save();
    // Temporarily override password with TOTP appended without saving TOTP
    const orig = settings.relay.password;
    settings.relay = { ...settings.relay, password: fullPassword };
    chat.connect();
    settings.relay = { ...settings.relay, password: orig };
    // Don't close here — let the connection state effect handle it.
    // While connecting the modal stays visible with the "Connecting…" spinner.
    // +page.svelte's $effect closes the modal on CONNECTED and re-opens on error.
  }

  function applyProfile(name: string) {
    const p = settings.profiles.find(p => p.name === name);
    if (!p) return;
    host = p.relay.host; port = p.relay.port;
    tls = p.relay.tls; password = p.relay.password;
    compression = p.relay.compression;
  }

  function saveProfile() {
    const name = profileName.trim();
    if (!name) return;
    settings.relay = { host, port, tls, password, compression };
    settings.saveProfile(name);
    showSaveProfile = false;
    profileName = '';
  }

  function close() { onclose?.(); }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) connect();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="root" onkeydown={onKeydown} role="dialog" aria-modal="true" aria-label="Connect to WeeChat relay" tabindex="-1">
  <div class="page">

    <!-- Bear + wordmark -->
    <div class="brand">
      <div class="bear-wrap">
        <div class="bear-glow" aria-hidden="true"></div>
        <BearLogo size={96} variant="full" class="bear-svg" />
      </div>
      <h1 class="wordmark">DarkBear</h1>
      <p class="tagline">WeeChat Relay Client</p>
    </div>

    <!-- Form card -->
    <div class="card">

      {#if chat.error}
        <div class="error-banner">
          <svg class="w-4 h-4 flex-shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 10.5v.5"/>
          </svg>
          <span>{chat.error}</span>
        </div>
      {/if}

      <div class="fields">

        <div class="field">
          <label class="label" for="c-host">Host</label>
          <input id="c-host" class="input" type="text"
            bind:value={host} placeholder="relay.example.com"
            autocomplete="off" spellcheck="false" autocapitalize="none"/>
        </div>

        <div class="field-row">
          <div class="field" style="flex:1">
            <label class="label" for="c-port">Port</label>
            <input id="c-port" class="input" type="number"
              bind:value={port} min="1" max="65535" placeholder="9001"/>
          </div>
          <button role="switch" aria-checked={tls} onclick={() => (tls = !tls)} class="toggle" title="TLS">
            <span class="toggle-label" class:on={tls}>TLS</span>
            <span class="toggle-track" class:on={tls}><span class="toggle-knob" class:on={tls}></span></span>
          </button>
          <button role="switch" aria-checked={compression} onclick={() => (compression = !compression)} class="toggle" title="Compression">
            <span class="toggle-label" class:on={compression}>Zip</span>
            <span class="toggle-track" class:on={compression}><span class="toggle-knob" class:on={compression}></span></span>
          </button>
        </div>

        {#if settings.profiles.length > 0}
          <div class="field">
            <label class="label" for="c-profile">Profile</label>
            <select id="c-profile" class="input select"
              onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) applyProfile(v); (e.currentTarget as HTMLSelectElement).value = ''; }}>
              <option value="">— load profile —</option>
              {#each settings.profiles as p}
                <option value={p.name}>{p.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="field">
          <label class="label" for="c-pass">Password</label>
          <input id="c-pass" class="input" type="password"
            bind:value={password} placeholder="Relay password" autocomplete="new-password"/>
        </div>

        <div class="totp-row">
          <label class="totp-check">
            <input type="checkbox" bind:checked={useTotp}/>
            <span>TOTP</span>
          </label>
          {#if useTotp}
            <input class="input totp-input" type="text" inputmode="numeric" pattern="[0-9]*"
              bind:value={totp}
              oninput={() => { totp = totp.replace(/[^0-9]/g, '').slice(0, 6); }}
              placeholder="6-digit code" maxlength="6" autocomplete="one-time-code"/>
          {/if}
        </div>

        <button onclick={connect} disabled={connecting || !host || !password}
          class="connect-btn" class:ready={!connecting && !!host && !!password}>
          {#if connecting}
            <span class="spinner"></span>Connecting…
          {:else}
            Connect
          {/if}
        </button>

        {#if showSaveProfile}
          <div class="save-profile-row">
            <input class="input" type="text" bind:value={profileName} placeholder="Profile name" maxlength="32"/>
            <button onclick={saveProfile} class="save-btn" disabled={!profileName.trim()}>Save</button>
            <button onclick={() => { showSaveProfile = false; profileName = ''; }} class="discard-btn">✕</button>
          </div>
        {:else}
          <button onclick={() => (showSaveProfile = true)} class="save-profile-btn">Save as profile…</button>
        {/if}

        {#if onclose}
          <button onclick={close} class="cancel-btn">Cancel</button>
        {/if}

      </div>

      <p class="help">
        <code>/relay add weechat 9001</code>
        <span> · </span>
        <code>/set relay.network.password …</code>
      </p>
    </div>

  </div>
</div>

<style>
  /* Full-screen overlay — background gradient baked in, no separate blob elements */
  .root {
    position: fixed;
    inset: 0;
    z-index: 50;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background:
      radial-gradient(ellipse 600px 500px at -5% -10%, rgba(37,99,235,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 420px 380px at 105% 110%, rgba(139,92,246,0.16) 0%, transparent 60%),
      #0c0d12;
  }

  /* Centered column — min-height ensures centering even on short content */
  .page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 48px 20px;
    padding-bottom: max(48px, env(safe-area-inset-bottom, 0px));
    animation: enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Bear + wordmark */
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    user-select: none;
  }
  .bear-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
.bear-glow {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%);
    filter: blur(14px);
    animation: pulse 3s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1;   }
  }
  .wordmark {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-gray-100, #e8ebf5);
    margin: 0;
  }
  .tagline {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-gray-500, #484b5c);
    margin-top: 6px;
  }

  /* Form card */
  .card {
    width: 100%;
    max-width: 340px;
    max-height: 85dvh;
    overflow-y: auto;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 24px 20px 18px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.55), inset 0 0 0 0.5px rgba(255,255,255,0.04);
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 13px;
    color: #f87171;
    margin-bottom: 18px;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-gray-400, #686c7e);
  }

  .input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    color: var(--color-gray-100, #e8ebf5);
    font-size: 14px;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
  }
  .input::placeholder { color: var(--color-gray-600, #25272e); }
  .input:focus {
    border-color: rgba(59,130,246,0.5);
    background: rgba(255,255,255,0.07);
  }

  /* Toggle */
  .toggle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding-bottom: 1px;
    background: none;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }
  .toggle-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-gray-500, #484b5c);
    transition: color 0.15s;
  }
  .toggle-label.on { color: #60a5fa; }
  .toggle-track {
    position: relative;
    display: block;
    width: 40px;
    height: 22px;
    border-radius: 9999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.08);
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .toggle-track.on { background: #2563eb; }
  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    transition: transform 0.15s;
  }
  .toggle-knob.on { transform: translateX(18px); }

  /* Connect button */
  .connect-btn {
    width: 100%;
    padding: 11px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    background: rgba(37,99,235,0.3);
    color: rgba(255,255,255,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: not-allowed;
    border: 1px solid rgba(37,99,235,0.15);
    transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s;
    margin-top: 2px;
  }
  .connect-btn.ready {
    background: #2563eb;
    color: white;
    cursor: pointer;
    border-color: transparent;
    box-shadow: 0 4px 20px rgba(37,99,235,0.4);
  }
  .connect-btn.ready:hover  { background: #3b82f6; }
  .connect-btn.ready:active { background: #1d4ed8; transform: scale(0.98); }

  .spinner {
    width: 15px;
    height: 15px;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23686c7e'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
    cursor: pointer;
  }
  .select option { background: #111318; }

  .totp-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .totp-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-gray-400, #686c7e);
    cursor: pointer;
    flex-shrink: 0;
  }
  .totp-check input[type="checkbox"] { accent-color: #3b82f6; width: 14px; height: 14px; }
  .totp-input { flex: 1; letter-spacing: 0.15em; }

  .save-profile-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .save-profile-row .input { flex: 1; }
  .save-btn {
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(37,99,235,0.25);
    color: #93c5fd;
    border: 1px solid rgba(37,99,235,0.3);
    border-radius: 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: rgba(37,99,235,0.4); }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .discard-btn {
    padding: 7px 10px;
    font-size: 12px;
    color: var(--color-gray-500, #484b5c);
    background: none;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .discard-btn:hover { color: var(--color-gray-300, #9298aa); }
  .save-profile-btn {
    width: 100%;
    padding: 5px;
    font-size: 11px;
    color: var(--color-gray-500, #484b5c);
    background: none;
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: 8px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .save-profile-btn:hover { color: var(--color-gray-400, #686c7e); border-color: rgba(255,255,255,0.14); }

  /* Cancel */
  .cancel-btn {
    width: 100%;
    padding: 7px;
    font-size: 12px;
    color: var(--color-gray-600, #25272e);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .cancel-btn:hover { color: var(--color-gray-400, #686c7e); }

  /* Help text */
  .help {
    font-size: 11px;
    color: var(--color-gray-600, #25272e);
    text-align: center;
    margin-top: 16px;
    line-height: 1.7;
  }
  .help code {
    color: var(--color-gray-500, #484b5c);
    font-family: monospace;
  }
</style>
