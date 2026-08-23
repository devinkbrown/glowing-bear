// ConnectShell — first-run identity + one connection choice.
// Theme picker lives in Settings. Setup essays live in the closed-by-default drawer.

import { For, Index, Show, Suspense, createEffect, createSignal, lazy, onCleanup, onMount } from 'solid-js';
import { diagnoseReveal, fieldAttention, type FieldAttention } from '@/lib/connect/diagnose';
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
  const alertTitle = () => {
    const code = errorCode();
    if (code === 'totp_required') return t('connect.alert.totp');
    if (code === 'path_404') return t('connect.alert.path');
    if (code === 'origin_denied') return t('connect.alert.origin');
    if (code === 'mixed_content' || mixedBlocked()) return t('connect.alert.mixed');
    if (code) return t('connect.alert.generic');
    if (passwordFromUrl()) return t('connect.alert.secret');
    return null;
  };
  const formAlert = () => {
    if (errorText()) {
      return { kind: 'error' as const, title: alertTitle(), message: errorText()!, next: nextAction() };
    }
    if (mixedBlocked()) {
      return {
        kind: 'warn' as const,
        title: t('connect.alert.mixed'),
        message: t('connect.error.mixed_content'),
        next: t('connect.next.mixed_content'),
      };
    }
    if (passwordFromUrl()) {
      return { kind: 'warn' as const, title: t('connect.alert.secret'), message: t('connect.passwordInUrl'), next: null };
    }
    return null;
  };
  const attention = () => fieldAttention(errorCode()) ?? (mixedBlocked() ? 'tls' : null);
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

      <div class="connect-stage">
        <div class="flex-1 min-h-[12px] sm:min-h-0 connect-flex-spacer" />

        <div class="connect-shell">
        <div
          class={`connect-brand connect-hero select-none ${decorativeMotionEnabled() ? 'connect-motion' : ''}`}
        >
          <Show
            when={!compactHero()}
            fallback={
              <div
                data-testid="connect-compact-mark"
                class="login-mark"
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
          <h1 class="connect-hero-title">DarkBear</h1>
          <p data-testid="connect-product-line" class="connect-product-line">{t('connect.productLine')}</p>
        </div>

        <div class={`connect-card ${decorativeMotionEnabled() ? 'connect-motion-card' : ''}`}>
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
                <Show when={mode() !== 'onyx-tls'}>
                  <p
                    data-testid="connect-mode-hint"
                    class={`login-segment-hint login-segment-hint-${mode() === 'onyx-wss' ? 'onyx' : 'weechat'}`}
                  >
                    {selectedHint()}
                  </p>
                </Show>
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
                        class="login-chip">
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
                    class={`login-state mb-4 text-[13px] leading-snug ${
                      alert().kind === 'error' ? 'login-state-error' : 'login-state-warn'
                    }`}
                  >
                    <Show when={alert().title}>
                      <p data-testid="connect-alert-title" class="login-state-kicker">{alert().title}</p>
                    </Show>
                    <p>{alert().message}</p>
                    <Show when={alert().next}>
                      <p data-testid="connect-next-action" class="login-state-next mt-1">{alert().next}</p>
                    </Show>
                  </div>
                )}
              </Show>
              <Show when={connecting() && !formAlert()}>
                <div role="status" data-testid="connect-progress" class="login-state login-state-progress mb-4 text-[13px] leading-snug">
                  <p class="login-state-kicker">{t('connect.connecting')}</p>
                  {statusText() ?? t('connect.connecting')}
                </div>
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
                  attention={attention()}
                />
              </Show>

              <Show when={mode() === 'onyx-tls'}>
                <div class="login-empty mb-1" data-testid="connect-tls-empty">
                  <p class="login-empty-title">{t('connect.tlsEmptyTitle')}</p>
                  <p class="login-empty-body">{t('connect.modeOnyxTlsUnavailable')}</p>
                </div>
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
                    <div class="login-totp" data-testid="connect-onyx-totp-panel">
                      <p class="login-totp-label">{t('connect.onyxTotp')}</p>
                      <div class="login-totp-row">
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
                      attention={attention()}
                    />
                  </Show>
                </div>
              </Show>

              <div class="pt-3">
                <button type="submit" disabled={!ready()}
                  class={`group login-btn-height login-cta flex items-center justify-center gap-2.5
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
            class="login-locale"
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
  attention: FieldAttention;
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
          data-testid={props.attention === 'tls' ? 'connect-tls-attention' : undefined}
          class={`flex items-center justify-center px-5 min-w-[88px] login-input-height text-[13px] font-semibold login-tls ${
            props.tls ? 'login-tls-on' : ''
          } ${props.attention === 'tls' ? 'login-tls-attention' : ''}`}>
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
              <input
                id="c-path"
                class={`login-input ${props.attention === 'path' ? 'login-input-attention' : ''}`}
                data-testid={props.attention === 'path' ? 'connect-path-attention' : undefined}
                value={props.path}
                onInput={(e) => props.onPath(e.currentTarget.value)} autocomplete="off" spellcheck={false} />
            </Field>
            <p
              class={`text-[11px] text-gray-600 ${props.attention === 'origin' ? 'login-hint-attention' : ''}`}
              data-testid={props.attention === 'origin' ? 'connect-origin-attention' : undefined}
            >
              {t('connect.originHint')}
            </p>
          </Show>
          <div
            class={`login-totp ${props.attention === 'totp' ? 'login-totp-attention' : ''}`}
            data-testid="connect-totp-panel"
          >
            <p class="login-totp-label">{t('connect.weechatTotp')}</p>
            <div class="login-totp-row">
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
        </div>
      </Show>
    </div>
  );
}
