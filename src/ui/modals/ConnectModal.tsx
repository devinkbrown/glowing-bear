// ConnectShell — first-run identity + one connection choice.
// Theme picker lives in Settings. Setup essays live in the closed-by-default drawer.

import { For, Index, Show, Suspense, createEffect, createSignal, lazy, onCleanup, onMount } from 'solid-js';
import { diagnoseReveal } from '@/lib/connect/diagnose';
import {
  ConnectionState,
  connect,
  connectionError,
  connectionErrorCode,
  connectionState,
  saveProfile,
  saveSettings,
  setConnectServerType,
  setSessionKind,
  settings,
  updateBridge,
  updateRelay,
  updateSettings,
} from '@/state';
import { sessionKindFromConnect } from '@/lib/connect/sessionKind';
import { bridgeState } from '@/state/bridge';
import { applyLocalePreference, t } from '@/lib/i18n';
import type { LocalePreference } from '@/types';
import { isImeComposing } from '@/primitives/ime';
import { currentPerformanceTier } from '@/lib/performance';
import { createMediaQuery } from '@/primitives/mediaQuery';
import type { ConnectServerType } from '@/lib/connect/serverTypes';
import {
  mixedContentBlocked,
  parseRelayHostInput,
  parseRelayLocationParams,
} from '@/lib/weechat/relayUrl';
import { NODES } from '@/lib/irc/nodes';
import SetupGuide from './SetupGuide';

const AstronautBear = lazy(() => import('@/ui/bits/AstronautBear'));

interface ThemeAccent { accent: string; bg1: string; bg2: string; bg3: string }

const THEME_ACCENT: Record<string, ThemeAccent> = {
  darkbear:      { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
  midnight:      { accent: '#60a5fa', bg1: '#0a0e1a', bg2: '#060a12', bg3: '#020408' },
  obsidian:      { accent: '#a78bfa', bg1: '#0c0a14', bg2: '#08060e', bg3: '#040208' },
  nord:          { accent: '#88c0d0', bg1: '#0d1117', bg2: '#0a0e14', bg3: '#060a0e' },
  gruvbox:       { accent: '#fabd2f', bg1: '#1a1410', bg2: '#120e0a', bg3: '#0a0806' },
  'rose-pine':   { accent: '#c4a7e7', bg1: '#150e18', bg2: '#0e0812', bg3: '#08040a' },
  abyss:         { accent: '#0ea5e9', bg1: '#020810', bg2: '#01060c', bg3: '#000408' },
  ember:         { accent: '#f97316', bg1: '#120a04', bg2: '#0c0602', bg3: '#060200' },
  aurora:        { accent: '#34d399', bg1: '#080d12', bg2: '#040a0e', bg3: '#020608' },
  catppuccin:    { accent: '#cba6f7', bg1: '#11111b', bg2: '#0c0c14', bg3: '#06060c' },
  'tokyo-night': { accent: '#7aa2f7', bg1: '#0a0e16', bg2: '#080a12', bg3: '#04060a' },
  dracula:       { accent: '#bd93f9', bg1: '#16101e', bg2: '#0e0a14', bg3: '#06040a' },
  solarized:     { accent: '#268bd2', bg1: '#001620', bg2: '#001018', bg3: '#000810' },
  starfield:     { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
  lightning:     { accent: '#60a5fa', bg1: '#080a12', bg2: '#06080e', bg3: '#02040a' },
  phoenix:       { accent: '#f59e0b', bg1: '#120a04', bg2: '#0c0602', bg3: '#060200' },
  retro:         { accent: '#ff00ff', bg1: '#0a0a18', bg2: '#060612', bg3: '#02020a' },
  light:         { accent: '#4f46e5', bg1: '#e8eaf0', bg2: '#dde0e8', bg3: '#d0d4e0' },
  custom:        { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
};

interface Props {
  open?: boolean;
  onClose?: () => void;
}

export default function ConnectModal(props: Props) {
  return (
    <Show when={props.open ?? true}>
      <ConnectScreen onClose={props.onClose} />
    </Show>
  );
}

function ConnectScreen(props: { onClose?: () => void }) {
  const lowDecorativeQuality = currentPerformanceTier() === 'low';
  const prefersReducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
  const shortViewport = createMediaQuery('(max-height: 740px)');
  const decorativeMotionEnabled = () =>
    !lowDecorativeQuality &&
    !prefersReducedMotion() &&
    settings.animateThemes &&
    settings.sceneMotion !== 'reduced';
  // Short viewports keep the password in view: the illustrated mascot never
  // sits above the secret field on a phone landscape / compact height.
  const compactHero = () => !decorativeMotionEnabled() || shortViewport();

  const [mode, setMode] = createSignal<ConnectServerType>('weechat');
  const [host, setHost] = createSignal(settings.relay.host);
  const [port, setPort] = createSignal(settings.relay.port);
  const [path, setPath] = createSignal(settings.relay.path || 'weechat');
  const [tls, setTls] = createSignal(
    typeof window !== 'undefined' && window.isSecureContext ? true : settings.relay.tls,
  );
  const [password, setPassword] = createSignal(settings.relay.password);
  const [rememberPassword, setRememberPassword] = createSignal(settings.rememberRelayPassword);
  const [compression, setCompression] = createSignal(settings.relay.compression);
  const [totp, setTotp] = createSignal('');
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [showPassword, setShowPassword] = createSignal(false);
  const [showSetup, setShowSetup] = createSignal(false);
  const [showAlsoRelay, setShowAlsoRelay] = createSignal(false);
  const [showOnyxTotp, setShowOnyxTotp] = createSignal(false);
  const [passwordFromUrl, setPasswordFromUrl] = createSignal(false);
  const [profileName, setProfileName] = createSignal('');
  const [showSaveProfile, setShowSaveProfile] = createSignal(false);
  const [onyxNick, setOnyxNick] = createSignal(settings.bridge.account);
  const [bridgeAccount, setBridgeAccount] = createSignal(settings.bridge.account);
  const [bridgePassword, setBridgePassword] = createSignal(settings.bridge.password);
  const [onyxTotp, setOnyxTotp] = createSignal('');
  const onyxTotpRefs: (HTMLInputElement | undefined)[] = [];
  const [bridgeEndpoint, setBridgeEndpoint] = createSignal(
    settings.bridge.wsUrl || NODES[1]?.wss || 'wss://eshmaki.me:8080',
  );
  const [rememberBridgePassword, setRememberBridgePassword] = createSignal(settings.rememberBridgePassword);

  let hostRef: HTMLInputElement | undefined;
  const totpRefs: (HTMLInputElement | undefined)[] = [];

  const connecting = () =>
    connectionState() === ConnectionState.CONNECTING ||
    connectionState() === ConnectionState.AUTHENTICATING ||
    (mode() === 'onyx-wss' && showAlsoRelay() && bridgeState.status === 'connecting');

  const weechatReady = () => !!host() && !!password();
  const onyxReady = () => !!bridgeEndpoint() && !!(onyxNick() || bridgeAccount()) && !!bridgePassword();
  const ready = () => {
    if (connecting()) return false;
    if (mode() === 'onyx-tls') return false;
    if (mode() === 'onyx-wss') return onyxReady();
    return weechatReady();
  };

  const applyHostInput = (raw: string) => {
    const parsed = parseRelayHostInput(raw);
    if (!parsed) {
      setHost(raw.replace(/^(wss|ws|https|http):\/\//i, ''));
      return;
    }
    setHost(parsed.host);
    if (parsed.port) setPort(parsed.port);
    if (parsed.path) setPath(parsed.path);
  };

  onMount(() => {
    if (hostRef && !host()) hostRef.focus();
    if (typeof window === 'undefined') return;
    const params = parseRelayLocationParams(window.location.search, window.location.hash);
    if (params.host) setHost(params.host);
    if (params.port) setPort(params.port);
    if (params.path) setPath(params.path);
    if (params.tls !== undefined) setTls(params.tls);
    if (params.password) {
      setPassword(params.password);
      setPasswordFromUrl(true);
    }
    if (params.autoconnect && params.host && (params.password || password())) {
      queueMicrotask(() => doConnect());
    }
  });

  const persistWeechat = () => {
    updateRelay({
      host: host(),
      port: port(),
      tls: tls(),
      password: password(),
      compression: compression(),
      path: path(),
    });
    updateSettings({ rememberRelayPassword: rememberPassword() });
  };

  const doConnect = () => {
    if (!ready()) return;
    if (mode() === 'weechat') {
      if (mixedContentBlocked(tls(), host())) {
        persistWeechat();
        saveSettings();
        connect();
        return;
      }
      persistWeechat();
      updateBridge({ enabled: false });
      setSessionKind('weechat-generic');
      setConnectServerType('weechat');
      saveSettings();
      connect({ totp: totp().trim() || undefined });
      return;
    }

    const useRelay = showAlsoRelay() && weechatReady();
    const kind = sessionKindFromConnect('onyx-wss', useRelay);
    const nick = onyxNick().trim() || bridgeAccount().trim();
    updateBridge({
      enabled: useRelay,
      wsUrl: bridgeEndpoint(),
      account: bridgeAccount().trim() || nick,
      password: bridgePassword(),
    });
    updateSettings({ rememberBridgePassword: rememberBridgePassword() });
    setSessionKind(kind);
    setConnectServerType('onyx-wss');
    if (useRelay) persistWeechat();
    saveSettings();
    connect({
      totp: useRelay ? (totp().trim() || undefined) : undefined,
      onyxTotp: onyxTotp().trim() || undefined,
      nick,
    });
  };

  const applyProfile = (name: string) => {
    const p = settings.profiles.find((x) => x.name === name);
    if (!p) return;
    setHost(p.relay.host);
    setPort(p.relay.port);
    setTls(p.relay.tls);
    setPassword(p.relay.password);
    setRememberPassword(p.rememberPassword);
    setCompression(p.relay.compression);
    setPath(p.relay.path || 'weechat');
  };

  const doSaveProfile = () => {
    const name = profileName().trim();
    if (!name) return;
    persistWeechat();
    saveProfile(name, rememberPassword());
    setShowSaveProfile(false);
    setProfileName('');
  };

  const handleTotpDigit = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const digits = totp().padEnd(6, ' ').split('');
    digits[index] = digit;
    setTotp(digits.join('').trimEnd());
    if (digit && index < 5) totpRefs[index + 1]?.focus();
  };

  const handleTotpKeyDown = (index: number, e: KeyboardEvent) => {
    if (isImeComposing(e)) return;
    if (e.key === 'Backspace' && !totp()[index] && index > 0) totpRefs[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) totpRefs[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) totpRefs[index + 1]?.focus();
  };

  onMount(() => {
    function onKeydown(e: KeyboardEvent) {
      if (isImeComposing(e)) return;
      if (e.key === 'Escape') {
        if (showSetup()) { setShowSetup(false); return; }
        if (showSaveProfile()) { setShowSaveProfile(false); return; }
        if (showAdvanced()) { setShowAdvanced(false); return; }
        if (showOnyxTotp()) { setShowOnyxTotp(false); return; }
        if (showAlsoRelay()) { setShowAlsoRelay(false); return; }
        props.onClose?.();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doConnect();
    }
    window.addEventListener('keydown', onKeydown);
    onCleanup(() => window.removeEventListener('keydown', onKeydown));
  });

  const statusText = () =>
    connectionState() === ConnectionState.CONNECTING ? t('connect.establishing') :
    connectionState() === ConnectionState.AUTHENTICATING ? t('connect.authenticating') :
    null;

  const tc = () => THEME_ACCENT[settings.theme] ?? THEME_ACCENT.darkbear!;
  const errorCode = () => connectionErrorCode();
  const errorText = () => {
    const code = errorCode();
    if (code) return t(`connect.error.${code}`);
    return connectionError();
  };
  const nextAction = () => {
    const code = errorCode();
    if (!code) return null;
    if (code === 'tls_untrusted') return t('connect.next.tls_untrusted', { host: host(), port: String(port()) });
    return t(`connect.next.${code}`);
  };
  const showTotp = () =>
    showAdvanced() || diagnoseReveal(errorCode()) === 'totp' || errorCode() === 'totp_required';
  const mixedBlocked = () => mode() === 'weechat' && mixedContentBlocked(tls(), host());
  // One form alert: a single failure plus at most one next action. Phase logs
  // stay off the first-run card — connecting status lives on the CTA.
  const formAlert = () => {
    if (errorText()) {
      return { kind: 'error' as const, message: errorText()!, next: nextAction() };
    }
    if (mixedBlocked()) {
      return {
        kind: 'warn' as const,
        message: t('connect.error.mixed_content'),
        next: t('connect.next.mixed_content'),
      };
    }
    if (passwordFromUrl()) {
      return { kind: 'warn' as const, message: t('connect.passwordInUrl'), next: null };
    }
    return null;
  };
  const selectedHint = () => {
    if (mode() === 'weechat') return t('connect.taglineWeechat');
    if (mode() === 'onyx-wss') return t('connect.taglineOnyx');
    return t('connect.modeOnyxTlsUnavailable');
  };
  const ctaDominant = () => ready() || connecting();

  createEffect(() => {
    if (diagnoseReveal(errorCode()) === 'advanced') setShowAdvanced(true);
  });

  const setLocale = (locale: LocalePreference) => {
    updateSettings({ locale });
    applyLocalePreference(locale);
    saveSettings();
  };

  return (
    <div class="fixed inset-0 z-50 overflow-y-auto">
      <div class="fixed inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, ${tc().bg1} 0%, ${tc().bg2} 50%, ${tc().bg3} 100%)` }} />

      <Show when={decorativeMotionEnabled()}>
        <div data-testid="connect-decorative-background" class="darkbear-decorative-scene fixed inset-0 pointer-events-none">
          <div
            class="absolute inset-0 opacity-40"
            style={{
              'background-image': [
                'radial-gradient(circle at 12% 18%, rgba(255,255,255,.65) 0 1px, transparent 1.5px)',
                'radial-gradient(circle at 72% 28%, rgba(180,195,255,.55) 0 1px, transparent 1.5px)',
                'radial-gradient(circle at 38% 76%, rgba(255,220,190,.45) 0 1px, transparent 1.5px)',
              ].join(','),
              'background-size': '97px 113px, 149px 131px, 181px 167px',
            }}
          />
          <div
            class="absolute inset-0 opacity-[0.18] login-ripple"
            style={{
              'background-image': `radial-gradient(circle at 50% 40%, ${tc().accent}33, transparent 42%)`,
            }}
          />
          <div class="absolute w-[600px] h-[600px] sm:w-[900px] sm:h-[900px] -top-[200px] -right-[200px] rounded-full opacity-[0.06]"
            style={{ background: `radial-gradient(circle, ${tc().accent}, transparent 50%)`, animation: 'login-float-a 30s ease-in-out infinite' }} />
          <div class="absolute w-[420px] h-[420px] sm:w-[640px] sm:h-[640px] -bottom-[180px] -left-[140px] rounded-full opacity-[0.05]"
            style={{ background: `radial-gradient(circle, ${tc().accent}, transparent 55%)`, animation: 'login-float-b 42s ease-in-out infinite' }} />
        </div>
      </Show>

      <div class="min-h-dvh flex flex-col relative z-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div class="flex-1 min-h-[12px] sm:min-h-0 connect-flex-spacer" />

        <div
          class="connect-hero flex flex-col items-center px-6 pb-1 sm:pb-2 select-none"
          style={decorativeMotionEnabled() ? { animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both' } : undefined}
        >
          <Show
            when={!compactHero()}
            fallback={
              <div
                data-testid="connect-compact-mark"
                class="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] font-mono text-[13px] font-black tracking-[0.16em] text-gray-300"
                aria-hidden="true"
              >
                DB
              </div>
            }
          >
            <Suspense fallback={<div class="h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]" />}>
              <AstronautBear animated={false} size={72} class="sm:w-[88px] sm:h-[88px]" accent={tc().accent} theme={settings.theme} />
            </Suspense>
          </Show>
          <h1 class="connect-hero-title text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--color-gray-100)] mt-1">DarkBear</h1>
        </div>

        <div
          class="w-full sm:max-w-[440px] sm:mx-auto"
          style={decorativeMotionEnabled() ? { animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' } : undefined}
        >
          <div class="px-5 pb-6 sm:px-0 sm:pb-0">
            <div class="login-card-inner">
              <div class="mb-5" role="radiogroup" aria-label={t('connect.serverType')}>
                <div class={`login-segment ${mode() === 'onyx-tls' ? 'login-segment-dim' : ''}`}>
                  <ModeButton
                    id="weechat"
                    active={mode() === 'weechat'}
                    title={t('connect.modeWeechatShort')}
                    onSelect={() => setMode('weechat')}
                  />
                  <ModeButton
                    id="onyx-wss"
                    active={mode() === 'onyx-wss'}
                    title={t('connect.modeOnyxShort')}
                    onSelect={() => setMode('onyx-wss')}
                  />
                </div>
                <p
                  data-testid="connect-mode-hint"
                  class={mode() === 'onyx-tls'
                    ? 'login-state mt-3 text-[12px] leading-snug'
                    : `login-segment-hint login-segment-hint-${mode() === 'onyx-wss' ? 'onyx' : 'weechat'}`}
                >
                  {selectedHint()}
                </p>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode() === 'onyx-tls'}
                  data-testid="connect-mode-onyx-tls"
                  onClick={() => setMode('onyx-tls')}
                  class={`mt-1 w-full login-quiet ${mode() === 'onyx-tls' ? 'text-gray-400' : ''}`}
                >
                  {t('connect.modeOnyxTls')}
                </button>
              </div>

              <Show when={settings.profiles.length > 0}>
                <div class="mb-5 flex gap-2 overflow-x-auto pb-1">
                  <For each={settings.profiles}>
                    {(p) => (
                      <button type="button" onClick={() => applyProfile(p.name)}
                        class="shrink-0 px-4 py-2.5 text-[13px] font-medium rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-400 min-h-[44px]">
                        {p.name}
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={formAlert()}>
                {(alert) => (
                  <div
                    role="alert"
                    data-testid="connect-diagnose"
                    data-error-code={errorCode() ?? ''}
                    class={`login-state mb-4 text-[12px] leading-snug ${
                      alert().kind === 'error' ? 'login-state-error' : 'login-state-warn'
                    }`}
                  >
                    <p>{alert().message}</p>
                    <Show when={alert().next}>
                      <p data-testid="connect-next-action" class="login-state-next mt-1">{alert().next}</p>
                    </Show>
                  </div>
                )}
              </Show>

              <form
                aria-busy={connecting() ? 'true' : undefined}
                onSubmit={(e) => {
                  e.preventDefault();
                  doConnect();
                }}
              >
              <Show when={mode() === 'weechat'}>
                <WeeChatFields
                  host={host()}
                  port={port()}
                  tls={tls()}
                  password={password()}
                  remember={rememberPassword()}
                  showPassword={showPassword()}
                  showAdvanced={showAdvanced()}
                  showTotp={showTotp()}
                  totp={totp()}
                  compression={compression()}
                  path={path()}
                  hostRef={(el) => { hostRef = el; }}
                  totpRefs={totpRefs}
                  onHost={applyHostInput}
                  onPort={setPort}
                  onTls={() => setTls(!tls())}
                  onPassword={setPassword}
                  onRemember={() => setRememberPassword(!rememberPassword())}
                  onShowPassword={() => setShowPassword(!showPassword())}
                  onAdvanced={() => setShowAdvanced(!showAdvanced())}
                  onCompression={() => setCompression(!compression())}
                  onPath={setPath}
                  onTotpDigit={handleTotpDigit}
                  onTotpKeyDown={handleTotpKeyDown}
                />
              </Show>

              <Show when={mode() === 'onyx-wss'}>
                <div class="flex flex-col gap-3">
                  <Field label={t('connect.endpoint')} id="c-endpoint">
                    <input id="c-endpoint" class="login-input" value={bridgeEndpoint()}
                      onInput={(e) => setBridgeEndpoint(e.currentTarget.value)} autocomplete="off" spellcheck={false} />
                  </Field>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={t('connect.nick')} id="c-nick">
                      <input id="c-nick" class="login-input" value={onyxNick()}
                        onInput={(e) => setOnyxNick(e.currentTarget.value)}
                        placeholder={t('connect.nick')} autocomplete="nickname" spellcheck={false} />
                    </Field>
                    <Field label={t('connect.account')} id="c-account">
                      <input id="c-account" class="login-input" value={bridgeAccount()}
                        onInput={(e) => setBridgeAccount(e.currentTarget.value)}
                        placeholder={t('connect.accountNick')} autocomplete="username" spellcheck={false} />
                    </Field>
                  </div>
                  <Field label={t('connect.password')} id="c-onyx-pass">
                    <input id="c-onyx-pass" class="login-input" type="password" value={bridgePassword()}
                      onInput={(e) => setBridgePassword(e.currentTarget.value)}
                      placeholder={t('connect.passwordOrToken')} autocomplete="current-password" />
                  </Field>
                  <button
                    type="button"
                    onClick={() => setShowOnyxTotp(!showOnyxTotp())}
                    class="login-quiet text-left"
                    aria-expanded={showOnyxTotp()}
                  >
                    {t('connect.onyxTotp')}
                  </button>
                  <Show when={showOnyxTotp()}>
                    <div class="flex gap-2 justify-center">
                      <Index each={new Array<number>(6).fill(0)}>
                        {(_, i) => (
                          <input
                            ref={(el) => { onyxTotpRefs[i] = el; }}
                            type="text"
                            inputmode="numeric"
                            maxlength={1}
                            value={onyxTotp()[i] ?? ''}
                            onInput={(e) => {
                              const digit = e.currentTarget.value.replace(/[^0-9]/g, '').slice(-1);
                              const digits = onyxTotp().padEnd(6, ' ').split('');
                              digits[i] = digit;
                              setOnyxTotp(digits.join('').trimEnd());
                              if (digit && i < 5) onyxTotpRefs[i + 1]?.focus();
                            }}
                            onKeyDown={(e) => {
                              if (isImeComposing(e)) return;
                              if (e.key === 'Backspace' && !onyxTotp()[i] && i > 0) onyxTotpRefs[i - 1]?.focus();
                              if (e.key === 'ArrowLeft' && i > 0) onyxTotpRefs[i - 1]?.focus();
                              if (e.key === 'ArrowRight' && i < 5) onyxTotpRefs[i + 1]?.focus();
                            }}
                            autocomplete="one-time-code"
                            aria-label={t('connect.totpDigit', { index: i + 1 })}
                            class="login-totp-digit"
                          />
                        )}
                      </Index>
                    </div>
                  </Show>
                  <button type="button" onClick={() => setRememberBridgePassword(!rememberBridgePassword())}
                    aria-pressed={rememberBridgePassword()} class="flex items-center gap-2 text-[11px] text-gray-500">
                    <span class={`login-toggle ${rememberBridgePassword() ? 'login-toggle-on' : ''}`}><span class="login-toggle-dot" /></span>
                    {t('connect.rememberAccount')}
                  </button>
                  <button type="button" onClick={() => setShowAlsoRelay(!showAlsoRelay())}
                    class="login-quiet text-left" aria-expanded={showAlsoRelay()}>
                    {t('connect.alsoRelay')}
                  </button>
                  <Show when={showAlsoRelay()}>
                    <WeeChatFields
                      host={host()}
                      port={port()}
                      tls={tls()}
                      password={password()}
                      remember={rememberPassword()}
                      showPassword={showPassword()}
                      showAdvanced={showAdvanced()}
                      showTotp={showTotp()}
                      totp={totp()}
                      compression={compression()}
                      path={path()}
                      hostRef={(el) => { hostRef = el; }}
                      totpRefs={totpRefs}
                      onHost={applyHostInput}
                      onPort={setPort}
                      onTls={() => setTls(!tls())}
                      onPassword={setPassword}
                      onRemember={() => setRememberPassword(!rememberPassword())}
                      onShowPassword={() => setShowPassword(!showPassword())}
                      onAdvanced={() => setShowAdvanced(!showAdvanced())}
                      onCompression={() => setCompression(!compression())}
                      onPath={setPath}
                      onTotpDigit={handleTotpDigit}
                      onTotpKeyDown={handleTotpKeyDown}
                    />
                  </Show>
                </div>
              </Show>

              <div class="pt-3">
                <button type="submit" disabled={!ready()}
                  class={`group w-full login-btn-height login-cta text-[15px] font-semibold flex items-center justify-center gap-2.5
                    ${ctaDominant() ? 'login-cta-ready' : 'login-cta-idle'}`}>
                  <Show when={connecting()} fallback={t('connect.connect')}>
                    <span class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    {statusText()}
                  </Show>
                </button>
              </div>
              </form>

              <div class="mt-2 flex flex-col">
                <button type="button" onClick={() => setShowSetup(!showSetup())}
                  class="login-quiet w-full text-center"
                  aria-expanded={showSetup()}>
                  {showSetup() ? t('connect.setupClose') : t('connect.setup')}
                </button>
                <SetupGuide
                  open={showSetup()}
                  type={mode()}
                  port={port()}
                  tls={tls()}
                  path={path()}
                  endpoint={bridgeEndpoint()}
                />
                <Show when={mode() === 'weechat'}>
              <Show
                when={showSaveProfile()}
                fallback={
                  <button type="button" onClick={() => setShowSaveProfile(true)}
                    class="login-quiet w-full text-center">
                    {t('connect.saveProfile')}
                  </button>
                }
              >
                <div class="mt-3 flex gap-2">
                  <input class="login-input flex-1 !h-[44px]" value={profileName()}
                    onInput={(e) => setProfileName(e.currentTarget.value)}
                    placeholder={t('connect.profileName')}
                    onKeyDown={(e) => {
                      if (isImeComposing(e)) return;
                      if (e.key === 'Enter') doSaveProfile();
                    }} />
                  <button type="button" onClick={doSaveProfile} disabled={!profileName().trim()}
                    class="px-4 h-[44px] text-[13px] font-semibold text-[var(--custom-accent,#818cf8)]">
                    {t('connect.save')}
                  </button>
                </div>
              </Show>
                </Show>
              </div>

              <Show when={props.onClose}>
                <button type="button" onClick={() => props.onClose?.()}
                  class="mt-2 w-full h-[44px] text-[13px] text-gray-600">
                  {t('connect.backToChat')}
                </button>
              </Show>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-[12px] sm:min-h-0 connect-flex-spacer" />

        <div class="flex items-center justify-center gap-3 pb-4 sm:pb-6">
          <p class="text-[10px] text-gray-700 font-mono tracking-wider">v3.0</p>
          <label class="sr-only" for="connect-locale">{t('locale.language')}</label>
          <select
            id="connect-locale"
            class="bg-transparent text-[10px] text-gray-500 outline-none"
            value={settings.locale}
            onChange={(e) => setLocale(e.currentTarget.value as LocalePreference)}
          >
            <option value="system">{t('locale.system')}</option>
            <option value="en">{t('locale.english')}</option>
            <option value="de">{t('locale.german')}</option>
            <option value="ar">{t('locale.arabic')}</option>
          </select>
        </div>
      </div>

      <style>{`
        .login-card-inner {}
        @media (min-width: 640px) {
          .login-card-inner {
            background: linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.012) 100%);
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 30px 100px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);
            -webkit-backdrop-filter: blur(24px);
            backdrop-filter: blur(24px);
            border-radius: 20px;
            padding: 28px;
          }
        }
        .login-field { display: flex; flex-direction: column; gap: 0; }
        .login-label {
          display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-gray-500);
          padding-inline-start: 2px; margin-bottom: 6px;
        }
        .login-input {
          width: 100%; height: 52px;
          background: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-gray-100, #e8eaf0) 12%, transparent);
          border-radius: 14px; color: var(--color-gray-200, #e0e4f0);
          font-size: 16px; padding: 0 16px; outline: none;
        }
        .login-input:focus-visible,
        .login-totp-digit:focus-visible {
          border-color: color-mix(in srgb, var(--custom-accent, #818cf8) 55%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--custom-accent, #818cf8) 28%, transparent);
        }
        .login-cta { border-radius: 14px; }
        .login-cta-ready {
          background: var(--custom-accent, #818cf8);
          color: #fff;
          cursor: pointer;
        }
        .login-cta-idle {
          background: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 6%, transparent);
          color: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 42%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-gray-100, #e8eaf0) 10%, transparent);
          cursor: not-allowed;
        }
        .login-cta:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--custom-accent, #818cf8) 80%, white);
          outline-offset: 3px;
        }
        .login-segment {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          padding: 3px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 5%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-gray-100, #e8eaf0) 10%, transparent);
        }
        .login-segment-dim { opacity: 0.55; }
        .login-segment-btn {
          min-height: 44px;
          border-radius: 11px;
          padding: 0 8px;
          text-align: center;
          font-size: 14px;
          font-weight: 650;
          color: var(--color-gray-400, #9aa3b8);
        }
        .login-segment-btn[aria-checked="true"] {
          background: var(--custom-accent, #818cf8);
          color: #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.28);
        }
        .login-segment-btn:hover:not([aria-checked="true"]) {
          color: var(--color-gray-200, #e0e4f0);
        }
        .login-segment-btn:focus-visible {
          z-index: 1;
          outline: 2px solid color-mix(in srgb, var(--custom-accent, #818cf8) 80%, white);
          outline-offset: 2px;
        }
        .login-segment-hint {
          margin-top: 8px;
          font-size: 12px;
          line-height: 1.4;
          color: var(--color-gray-500);
        }
        .login-segment-hint-weechat { text-align: start; }
        .login-segment-hint-onyx { text-align: end; }
        .login-state-next {
          color: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 72%, var(--role-mention, #f87171));
        }
        .login-state {
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--custom-accent, #818cf8) 22%, transparent);
          background: color-mix(in srgb, var(--custom-accent, #818cf8) 8%, transparent);
          padding: 12px 14px;
          color: var(--color-gray-200);
          text-align: start;
        }
        .login-state-error {
          border-color: color-mix(in srgb, var(--role-mention, #f87171) 28%, transparent);
          background: color-mix(in srgb, var(--role-mention, #f87171) 8%, transparent);
        }
        .login-state-warn {
          border-color: color-mix(in srgb, #f59e0b 28%, transparent);
          background: color-mix(in srgb, #f59e0b 8%, transparent);
        }
        .login-ripple { animation: login-ripple 48s ease-in-out infinite; }
        .login-input-height { height: 52px; }
        .login-btn-height { height: 54px; }
        @media (min-width: 640px) {
          .login-input { height: 46px; font-size: 14px; border-radius: 12px; padding: 0 14px; }
          .login-input-height { height: 46px; }
          .login-btn-height { height: 48px; }
          .login-cta, .login-state { border-radius: 12px; }
        }
        .login-toggle {
          position: relative; width: 44px; height: 26px; border-radius: 13px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
        }
        .login-toggle-on { background: color-mix(in srgb, var(--custom-accent, #818cf8) 70%, transparent); }
        .login-toggle-dot {
          position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: white;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .login-toggle-on .login-toggle-dot { transform: translateX(18px); }
        html[dir="rtl"] .login-toggle-on .login-toggle-dot { transform: translateX(-18px); }
        .login-quiet {
          min-height: 44px; font-size: 12px; color: var(--color-gray-500);
        }
        .login-quiet:hover { color: var(--color-gray-300); }
        .login-quiet:focus-visible,
        .login-tls:focus-visible,
        .login-tls-on:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--custom-accent, #818cf8) 80%, white);
          outline-offset: 2px;
          border-radius: 10px;
        }
        @media (min-width: 640px) {
          .login-quiet { min-height: 32px; }
        }
        .login-totp-digit {
          width: 42px; height: 52px; text-align: center; font-family: var(--mono-font);
          font-size: 22px; font-weight: 600; color: var(--color-gray-200, #e0e4f0);
          background: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-gray-100, #e8eaf0) 12%, transparent);
          border-radius: 12px; outline: none;
        }
        @media (min-width: 640px) {
          .login-totp-digit { width: 40px; height: 46px; font-size: 20px; border-radius: 10px; }
        }
        .guide-no-scrollbar { scrollbar-width: none; }
        @keyframes login-float-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -25px) scale(1.06); }
          66% { transform: translate(-20px, 18px) scale(0.96); }
        }
        @keyframes login-float-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-28px, 18px) scale(1.04); }
          70% { transform: translate(16px, -12px) scale(0.97); }
        }
        @keyframes login-ripple {
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50% { opacity: 0.22; transform: scale(1.06); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-tls {
          background: color-mix(in srgb, var(--color-gray-100, #e8eaf0) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-gray-100, #e8eaf0) 12%, transparent);
          color: var(--color-gray-400, #9aa3b8);
        }
        .login-tls-on {
          background: color-mix(in srgb, var(--custom-accent, #818cf8) 12%, transparent);
          border-color: color-mix(in srgb, var(--custom-accent, #818cf8) 28%, transparent);
          color: var(--color-gray-100, #e8eaf0);
        }
        @media (max-height: 740px) {
          .connect-hero-title { font-size: 18px; margin-top: 2px; }
          .connect-flex-spacer { min-height: 8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-ripple { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function ModeButton(props: {
  id: string;
  active: boolean;
  title: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      data-testid={`connect-mode-${props.id}`}
      disabled={props.disabled}
      onClick={() => { if (!props.disabled) props.onSelect(); }}
      class={`login-segment-btn ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {props.title}
    </button>
  );
}

function Field(props: { id: string; label: string; children: import('solid-js').JSX.Element }) {
  return (
    <div class="login-field">
      <label class="login-label" for={props.id}>{props.label}</label>
      {props.children}
    </div>
  );
}

function WeeChatFields(props: {
  host: string;
  port: number;
  tls: boolean;
  password: string;
  remember: boolean;
  showPassword: boolean;
  showAdvanced: boolean;
  showTotp: boolean;
  totp: string;
  compression: boolean;
  path: string;
  hostRef: (el: HTMLInputElement) => void;
  totpRefs: (HTMLInputElement | undefined)[];
  onHost: (v: string) => void;
  onPort: (v: number) => void;
  onTls: () => void;
  onPassword: (v: string) => void;
  onRemember: () => void;
  onShowPassword: () => void;
  onAdvanced: () => void;
  onCompression: () => void;
  onPath: (v: string) => void;
  onTotpDigit: (i: number, v: string) => void;
  onTotpKeyDown: (i: number, e: KeyboardEvent) => void;
}) {
  return (
    <div class="flex flex-col gap-3">
      <Field label={t('connect.hostname')} id="c-host">
        <input ref={props.hostRef} id="c-host" type="text" value={props.host}
          onInput={(e) => props.onHost(e.currentTarget.value)}
          placeholder={t('connect.hostnamePlaceholder')} autocomplete="off" spellcheck={false} class="login-input" />
      </Field>
      <div class="flex items-end gap-3">
        <div class="flex-1">
          <Field label={t('connect.port')} id="c-port">
            <input id="c-port" type="number" value={props.port}
              onInput={(e) => props.onPort(Number(e.currentTarget.value))}
              min={1} max={65535} class="login-input" />
          </Field>
        </div>
        <button type="button" onClick={props.onTls} aria-pressed={props.tls}
          class={`flex items-center justify-center px-5 min-w-[88px] login-input-height rounded-[14px] sm:rounded-xl text-[13px] font-semibold ${
            props.tls ? 'login-tls-on' : 'login-tls'
          }`}>
          TLS
        </button>
      </div>
      <Field label={t('connect.password')} id="c-pass">
        <div class="relative">
          <input id="c-pass" type={props.showPassword ? 'text' : 'password'} value={props.password}
            onInput={(e) => props.onPassword(e.currentTarget.value)}
            placeholder={t('connect.relayPassword')} autocomplete="current-password"
            class="login-input login-secret-input !pr-12" />
          <button type="button" onClick={props.onShowPassword} tabindex={-1}
            aria-label={props.showPassword ? t('connect.hideSecret') : t('connect.showSecret')}
            class="login-secret-toggle absolute end-0 top-0 bottom-0 w-11 flex items-center justify-center text-gray-600">
            ·
          </button>
        </div>
        <button type="button" onClick={props.onRemember} aria-pressed={props.remember}
          class="mt-2 flex items-center gap-2 text-left text-[11px] text-gray-500">
          <span class={`login-toggle ${props.remember ? 'login-toggle-on' : ''}`}><span class="login-toggle-dot" /></span>
          <span>{t('connect.remember')}<span class="block text-[9px] text-gray-700">{t('connect.sessionOnly')}</span></span>
        </button>
      </Field>
      <button type="button" onClick={props.onAdvanced} class="login-quiet self-start" aria-expanded={props.showAdvanced}>
        {t('connect.advanced')}
      </button>
      <Show when={props.showAdvanced || props.showTotp}>
        <div class="flex flex-col gap-3">
          <Show when={props.showAdvanced}>
            <div class="flex items-center justify-between min-h-[44px]">
              <span class="text-[13px] text-gray-400">{t('connect.compression')}</span>
              <button type="button" onClick={props.onCompression} aria-pressed={props.compression}
                class={`login-toggle ${props.compression ? 'login-toggle-on' : ''}`}>
                <div class="login-toggle-dot" />
              </button>
            </div>
            <Field label={t('connect.path')} id="c-path">
              <input id="c-path" class="login-input" value={props.path}
                onInput={(e) => props.onPath(e.currentTarget.value)} autocomplete="off" spellcheck={false} />
            </Field>
            <p class="text-[11px] text-gray-600">{t('connect.originHint')}</p>
          </Show>
          <span class="text-[13px] text-gray-400">{t('connect.weechatTotp')}</span>
          <div class="flex gap-2 justify-center">
            <Index each={new Array<number>(6).fill(0)}>
              {(_, i) => (
                <input
                  ref={(el) => { props.totpRefs[i] = el; }}
                  type="text"
                  inputmode="numeric"
                  maxlength={1}
                  value={props.totp[i] ?? ''}
                  onInput={(e) => props.onTotpDigit(i, e.currentTarget.value)}
                  onKeyDown={(e) => props.onTotpKeyDown(i, e)}
                  autocomplete="one-time-code"
                  aria-label={t('connect.totpDigit', { index: i + 1 })}
                  class="login-totp-digit"
                />
              )}
            </Index>
          </div>
        </div>
      </Show>
    </div>
  );
}
