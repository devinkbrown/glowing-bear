// Command-palette command model. buildPaletteCommands() folds the two sources
// the palette searches — open buffers and app actions — onto ONE list of
// PaletteCommand records, each with a `run` that dispatches through an existing
// @/state action (no new backend). The host filters/ranks this list with
// ./fuzzy and groups it back out by `group` for display.
//
// Every action here is backed by a function that already ships in @/state;
// nothing invents a bridge command. Buffer-scoped actions (mute, notify tier,
// split) surface only when there is an active buffer, and the oper console only
// when the session actually holds oper.

import {
  buffersState,
  cycleNotifyMode,
  getNotifyMode,
  getTemporaryMuteUntil,
  getSorted,
  isMuted,
  isOper,
  openModal,
  sendInput,
  setActive,
  setTheme,
  toggleMute,
  muteTemporarily,
  clearTemporaryMute,
  toggleOperConsole,
  toggleSearch,
  toggleSplit,
  toggleUserList,
  visibleUserActions,
  beginUserAction,
} from '@/state';
import type { ThemeId } from '@/state';
import { NOTIFY_MODES, type NotifyMode } from '@/lib/notifyDecision';
import { formatDate, t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { untilTomorrow } from '@/lib/notificationPolicy';
import { safeCommandDefinition } from '@/lib/userActions';

export type PaletteGroup = 'buffers' | 'actions';

export interface PaletteCommand {
  /** Stable id, also the roving option id seed. */
  id: string;
  group: PaletteGroup;
  /** Primary label, and the main fuzzy target. */
  title: string;
  /** Secondary hint shown right-aligned. */
  subtitle?: string;
  /** Leading monospace glyph. */
  glyph: string;
  /** Extra fuzzy terms beyond the title. */
  keywords: string[];
  /** The effect. The host closes the palette after this returns. */
  run: () => void;
  /** Buffer badges (buffers group only). */
  unread?: number;
  highlighted?: number;
}

/** Theme id → display label. Presentational; mirrors the Settings theme grid. */
const THEME_LABELS: ReadonlyArray<{ id: ThemeId; name: string }> = [
  { id: 'darkbear', name: 'DarkBear' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'obsidian', name: 'Obsidian' },
  { id: 'nord', name: 'Nord' },
  { id: 'gruvbox', name: 'Gruvbox' },
  { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'abyss', name: 'Abyss' },
  { id: 'ember', name: 'Ember' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'solarized', name: 'Solarized' },
  { id: 'starfield', name: 'Starfield' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'phoenix', name: 'Phoenix' },
  { id: 'retro', name: 'Retro Arcade' },
  { id: 'light', name: 'Light' },
];

function bufferGlyph(type: string, fullName: string): string {
  if (type === 'channel') return '#';
  if (type === 'private') return '@';
  if (type === 'server') return '~';
  if (/fset/i.test(fullName)) return 'S';
  if (/raw/i.test(fullName)) return 'R';
  return '*';
}

/** Jump-to-buffer commands — one per visible buffer, in sidebar order. */
function bufferCommands(): PaletteCommand[] {
  return getSorted()
    .filter((e) => !e.buffer.hidden)
    .map((e) => {
      const name = e.buffer.shortName || e.buffer.name;
      const type = e.buffer.localVars['type'] ?? '';
      return {
        id: `buffer:${e.buffer.id}`,
        group: 'buffers' as const,
        title: name,
        glyph: bufferGlyph(type, e.buffer.fullName),
        keywords: [e.buffer.fullName, type],
        unread: e.unread,
        highlighted: e.highlighted,
        run: () => setActive(e.buffer.id),
      };
    });
}

/** The label of the currently-active buffer, for buffer-scoped action hints. */
function activeName(): string | null {
  const ptr = buffersState.activeBuffer;
  if (!ptr) return null;
  const entry = getSorted().find((e) => e.buffer.id === ptr);
  if (!entry) return null;
  return entry.buffer.shortName || entry.buffer.name;
}

function nextNotify(current: NotifyMode): NotifyMode {
  const i = NOTIFY_MODES.indexOf(current);
  return NOTIFY_MODES[(i + 1) % NOTIFY_MODES.length] ?? current;
}

const NOTIFY_LABELS: Record<NotifyMode, MessageKey> = {
  all: 'palette.notifyAll',
  mentions: 'palette.notifyMentions',
  mute: 'palette.notifyMute',
};

function notifyLabel(mode: NotifyMode): string {
  return t(NOTIFY_LABELS[mode]);
}

/**
 * App-action commands. `query` seeds the dynamic join grammar: a query that
 * looks like a channel (`#name`) offers a Join action routed through the same
 * `/join` sendInput path the sidebar and channel-list use.
 */
function actionCommands(query: string): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const active = buffersState.activeBuffer;
  const name = activeName();

  // Dynamic: Join #channel from the query text.
  const chan = query.trim();
  if (/^#\S+/.test(chan)) {
    const target = chan.split(/\s+/)[0]!;
    commands.push({
      id: `action:join:${target.toLowerCase()}`,
      group: 'actions',
      title: t('palette.join', { target }),
      subtitle: t('palette.channel'),
      glyph: '#',
      keywords: ['join', 'channel', 'open', target],
      run: () => sendInput(`/join ${target}`),
    });
  }

  commands.push({
    id: 'action:settings',
    group: 'actions',
    title: t('palette.openSettings'),
    subtitle: t('palette.preferences'),
    glyph: '⚙',
    keywords: ['settings', 'preferences', 'options', 'appearance', 'config'],
    run: () => openModal('settings'),
  });

  if (active && name) {
    for (const action of visibleUserActions()) {
      const definition = safeCommandDefinition(action.commandId);
      commands.push({
        id: `action:user:${action.id}`,
        group: 'actions',
        title: action.name,
        subtitle: `${definition.label} · ${action.scope === 'global' ? t('palette.allProfiles') : action.scope.slice('profile:'.length)}`,
        glyph: '›',
        keywords: ['custom', 'user action', definition.label, definition.template, action.name],
        run: () => beginUserAction(action.id),
      });
    }

    const notify = getNotifyMode(active);
    commands.push({
      id: 'action:notify-cycle',
      group: 'actions',
      title: t('palette.cycleNotifications', { name }),
      subtitle: `${notifyLabel(notify)} → ${notifyLabel(nextNotify(notify))}`,
      glyph: '◐',
      keywords: ['notify', 'notification', 'tier', 'mentions', 'all', 'mute', 'alert', name],
      run: () => cycleNotifyMode(active),
    });

    const muted = isMuted(active);
    commands.push({
      id: 'action:mute',
      group: 'actions',
      title: t(muted ? 'palette.unmute' : 'palette.mute', { name }),
      subtitle: t(muted ? 'palette.muted' : 'palette.notifying'),
      glyph: muted ? '○' : '●',
      keywords: ['mute', 'unmute', 'silence', 'quiet', name],
      run: () => toggleMute(active),
    });

    const temporaryMuteUntil = getTemporaryMuteUntil(active);
    if (temporaryMuteUntil > Date.now()) {
      commands.push({
        id: 'action:mute-temporary-clear',
        group: 'actions',
        title: t('palette.resumeAlerts', { name }),
        subtitle: t('palette.mutedUntil', {
          time: formatDate(temporaryMuteUntil, { hour: '2-digit', minute: '2-digit' }),
        }),
        glyph: '◷',
        keywords: ['resume', 'temporary', 'mute', 'alerts', name],
        run: () => clearTemporaryMute(active),
      });
    } else {
      for (const option of [
        { id: '1h', label: t('palette.oneHour'), duration: () => 60 * 60 * 1000 },
        { id: '8h', label: t('palette.eightHours'), duration: () => 8 * 60 * 60 * 1000 },
        { id: 'tomorrow', label: t('palette.untilTomorrow'), duration: () => untilTomorrow() - Date.now() },
      ]) {
        commands.push({
          id: `action:mute-temporary-${option.id}`,
          group: 'actions',
          title: t('palette.muteFor', { duration: option.label, name }),
          subtitle: t('palette.temporaryDeviceOnly'),
          glyph: '◷',
          keywords: ['temporary', 'mute', 'snooze', 'quiet', option.label, name],
          run: () => muteTemporarily(active, option.duration()),
        });
      }
    }

    commands.push({
      id: 'action:split',
      group: 'actions',
      title: t('palette.toggleSplit', { name }),
      subtitle: t('palette.splitPane'),
      glyph: '‖',
      keywords: ['split', 'pane', 'side by side', 'compare', name],
      run: () => toggleSplit(active),
    });
  }

  commands.push({
    id: 'action:search',
    group: 'actions',
    title: t('palette.toggleSearch'),
    subtitle: t('palette.findInBuffer'),
    glyph: '⌕',
    keywords: ['search', 'find', 'grep', 'filter messages'],
    run: () => toggleSearch(),
  });

  commands.push({
    id: 'action:userlist',
    group: 'actions',
    title: t('palette.toggleMembers'),
    subtitle: t('palette.nicklist'),
    glyph: '☷',
    keywords: ['members', 'users', 'nicklist', 'people', 'roster'],
    run: () => toggleUserList(),
  });

  if (isOper()) {
    commands.push({
      id: 'action:oper-console',
      group: 'actions',
      title: t('palette.toggleOper'),
      subtitle: t('palette.operator'),
      glyph: '⚑',
      keywords: ['oper', 'operator', 'console', 'admin', 'staff'],
      run: () => toggleOperConsole(),
    });
  }

  for (const theme of THEME_LABELS) {
    commands.push({
      id: `action:theme:${theme.id}`,
      group: 'actions',
      title: t('palette.theme', { name: theme.name }),
      subtitle: t('palette.appearance'),
      glyph: '◆',
      keywords: ['theme', 'color', 'appearance', theme.id, theme.name],
      run: () => setTheme(theme.id),
    });
  }

  return commands;
}

/**
 * The full palette command list for the current query: buffers first, then
 * actions. Reactive — reads getSorted()/buffersState/isOper() so a host
 * createMemo re-derives it when the store or query changes.
 */
export function buildPaletteCommands(query: string): PaletteCommand[] {
  return [...bufferCommands(), ...actionCommands(query)];
}
