import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { addLine, buffersState, clearBuffers, upsertBuffer } from '@/state/buffers';
import {
  activityState,
  activityUnreadCount,
  openActivityPanel,
  recordActivity,
  resetActivity,
  sourceFromLine,
  toggleSavedMessage,
} from '@/state/activity';
import { resetThreads, threadsState } from '@/state/threads';
import type { WeeChatLine } from '@/types';
import ActivityPanel from './ActivityPanel';

beforeEach(() => {
  document.documentElement.dir = 'ltr';
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: true, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })),
  });
  clearBuffers();
  resetThreads();
  resetActivity();
});

afterEach(() => {
  cleanup();
  document.documentElement.dir = 'ltr';
});

describe('ActivityPanel', () => {
  it('isolates keyboard focus and restores it to the activity opener', async () => {
    let opener!: HTMLButtonElement;
    const { getByRole } = render(() => (
      <>
        <button ref={opener} type="button" onClick={() => openActivityPanel()}>Open activity test</button>
        <Show when={activityState.panelOpen}><ActivityPanel /></Show>
      </>
    ));

    opener.focus();
    fireEvent.click(opener);
    const panel = getByRole('dialog', { name: 'Activity and saved messages' });
    const close = getByRole('button', { name: 'Close activity panel' });
    await vi.waitFor(() => expect(close).toHaveFocus());
    expect(opener).toHaveAttribute('inert');

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(panel.contains(document.activeElement)).toBe(true);
    const last = document.activeElement;
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(last).not.toBe(close);
    expect(close).toHaveFocus();

    // Even if outside code attempts to move focus behind the overlay, the next
    // keyboard traversal is pulled back into the dialog.
    opener.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(activityState.panelOpen).toBe(false);
    expect(opener).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('jumps to inbox sources and edits private saved notes', () => {
    upsertBuffer({ id: 'p', number: 1, name: 'irc.x.#c', fullName: 'irc.x.#c', shortName: '#c', title: '', type: 0, nicksCount: 0, localVars: { type: 'channel' }, notify: 3, hidden: false });
    const date = new Date('2026-07-16T12:00:00Z');
    const line: WeeChatLine = { id: 'l', buffer: 'p', date, datePrinted: date, displayed: true, highlight: true, tags: [], prefix: 'alice', message: 'saved mention', nick: 'alice', ircTags: new Map(), msgid: 'm' };
    addLine('p', line, []);
    const entry = buffersState.buffers['p']!;
    const source = sourceFromLine(entry, line);
    toggleSavedMessage(source);
    recordActivity('mention', source);
    openActivityPanel();

    const { getByLabelText, getByRole, getByText } = render(() => <ActivityPanel />);
    expect(getByText('Inbox (1)')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: /Mention/ }));
    expect(activityUnreadCount()).toBe(0);
    expect(threadsState.scrollRequest?.msgid).toBe('m');

    fireEvent.click(getByRole('tab', { name: 'Saved (1)' }));
    const note = getByLabelText('Note for saved mention');
    fireEvent.change(note, { target: { value: 'follow up' } });
    expect(activityState.saved[0]?.note).toBe('follow up');
  });

  it('associates both tabpanels and roves focus in LTR', async () => {
    openActivityPanel();
    const { getByRole } = render(() => <ActivityPanel />);
    const tablist = getByRole('tablist', { name: 'Activity views' });
    const inbox = getByRole('tab', { name: 'Inbox' });
    const saved = getByRole('tab', { name: 'Saved (0)' });
    const inboxPanel = document.getElementById(inbox.getAttribute('aria-controls') ?? '');
    const savedPanel = document.getElementById(saved.getAttribute('aria-controls') ?? '');

    expect(tablist).toBeInTheDocument();
    expect(inbox).toHaveAttribute('aria-selected', 'true');
    expect(inbox).toHaveAttribute('tabindex', '0');
    expect(saved).toHaveAttribute('aria-selected', 'false');
    expect(saved).toHaveAttribute('tabindex', '-1');
    expect(inboxPanel).toHaveAttribute('role', 'tabpanel');
    expect(inboxPanel).toHaveAttribute('aria-labelledby', inbox.id);
    expect(inboxPanel).not.toHaveAttribute('hidden');
    expect(savedPanel).toHaveAttribute('role', 'tabpanel');
    expect(savedPanel).toHaveAttribute('aria-labelledby', saved.id);
    expect(savedPanel).toHaveAttribute('hidden');

    inbox.focus();
    fireEvent.keyDown(inbox, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(saved).toHaveFocus();
    expect(saved).toHaveAttribute('aria-selected', 'true');
    expect(savedPanel).not.toHaveAttribute('hidden');
    expect(inboxPanel).toHaveAttribute('hidden');

    fireEvent.keyDown(saved, { key: 'Home' });
    await Promise.resolve();
    expect(inbox).toHaveFocus();
    fireEvent.keyDown(inbox, { key: 'End' });
    await Promise.resolve();
    expect(saved).toHaveFocus();
  });

  it('maps horizontal tab arrows to the visual direction in RTL', async () => {
    document.documentElement.dir = 'rtl';
    openActivityPanel();
    const { getByRole } = render(() => <ActivityPanel />);
    const inbox = getByRole('tab', { name: 'Inbox' });
    const saved = getByRole('tab', { name: 'Saved (0)' });

    inbox.focus();
    fireEvent.keyDown(inbox, { key: 'ArrowLeft' });
    await Promise.resolve();
    expect(saved).toHaveFocus();
    expect(saved).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(saved, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(inbox).toHaveFocus();
    expect(inbox).toHaveAttribute('aria-selected', 'true');
  });
});
