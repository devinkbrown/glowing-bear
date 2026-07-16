// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSettings, settings } from '@/state/settings';
import TranscriptPanel from './TranscriptPanel';

const entries = [
  { channel: '#room', nick: 'Alice', text: 'First caption', time: Date.UTC(2026, 0, 1, 12, 0, 1) },
  { channel: '#room', nick: 'Bob', text: 'Second caption', time: Date.UTC(2026, 0, 1, 12, 0, 2) },
];

beforeEach(() => {
  resetSettings();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TranscriptPanel', () => {
  it('renders speaker-labelled rows and supports arrow-key traversal', () => {
    const view = render(() => <TranscriptPanel scope="#room" entries={entries} onClose={vi.fn()} />);
    expect(view.getByRole('dialog', { name: 'Call transcript' })).toBeInTheDocument();
    const rows = view.getAllByRole('listitem');
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(rows[1]!, { key: 'Home' });
    expect(rows[0]).toHaveFocus();
  });

  it('updates local caption presentation and explains default no-storage behavior', () => {
    const view = render(() => <TranscriptPanel scope="#room" entries={entries} onClose={vi.fn()} />);
    fireEvent.change(view.getByLabelText('Caption size'), { target: { value: 'large' } });
    fireEvent.change(view.getByLabelText('Caption background'), { target: { value: 'translucent' } });
    expect(settings.captionSize).toBe('large');
    expect(settings.captionBackground).toBe('translucent');
    expect(view.getByText(/local storage is off/i)).toBeInTheDocument();
  });

  it('exports only after an explicit button action', async () => {
    const createUrl = vi.fn(() => 'blob:caption-export');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const view = render(() => <TranscriptPanel scope="#room" entries={entries} onClose={vi.fn()} />);
    expect(createUrl).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Export .txt' }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeUrl).toHaveBeenCalledWith('blob:caption-export');
  });
});
