import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import type { IncidentFilter, OperatorAuditRecord } from '@/lib/operatorIncident';

const mocks = vi.hoisted(() => ({
  sendTo: vi.fn(),
  recordOperatorCommand: vi.fn(),
  saveIncidentFilter: vi.fn(),
  deleteIncidentFilter: vi.fn(),
  filters: [] as IncidentFilter[],
  audit: [] as OperatorAuditRecord[],
}));

vi.mock('@/state', () => ({
  buffersState: {
    activeBuffer: 'server',
    buffers: {
      server: {
        buffer: {
          id: 'server', number: 1, name: 'irc.orochi', fullName: 'irc.orochi', shortName: 'Orochi',
          title: '', type: 0, nicksCount: 0, localVars: { type: 'server', server: 'orochi-test' }, notify: 3, hidden: false,
        },
        lines: [
          {
            id: 'one', buffer: 'server', date: new Date('2026-07-16T12:00:00Z'), datePrinted: new Date('2026-07-16T12:00:00Z'),
            displayed: true, highlight: false, tags: [], prefix: '', nick: '', ircTags: new Map(),
            message: '@orochi.io/severity=notice :orochi.test EVENT oper USER CONNECT alice!u@10.0.0.1',
          },
          {
            id: 'two', buffer: 'server', date: new Date('2026-07-16T12:01:00Z'), datePrinted: new Date('2026-07-16T12:01:00Z'),
            displayed: true, highlight: false, tags: [], prefix: '', nick: '', ircTags: new Map(),
            message: '@orochi.io/severity=warn :orochi.test EVENT oper MEMBER JOIN #root alice',
          },
        ],
      },
    },
  },
  isOper: () => true,
  sendTo: mocks.sendTo,
  operatorIncidentState: { filters: mocks.filters, audit: mocks.audit },
  recordOperatorCommand: mocks.recordOperatorCommand,
  saveIncidentFilter: mocks.saveIncidentFilter,
  deleteIncidentFilter: mocks.deleteIncidentFilter,
}));

import OperConsole from './OperConsole';

beforeEach(() => {
  mocks.sendTo.mockReset();
  mocks.sendTo.mockReturnValue(true);
  mocks.recordOperatorCommand.mockReset();
  mocks.saveIncidentFilter.mockReset();
  mocks.deleteIncidentFilter.mockReset();
  mocks.filters.splice(0);
  mocks.audit.splice(0);
});

afterEach(() => cleanup());

describe('OperConsole incident workspace', () => {
  it('correlates event rows by nick and saves the current filter shape', () => {
    mocks.saveIncidentFilter.mockReturnValue({
      id: 'saved', name: 'Alice incident', categories: [], severities: ['info', 'notice', 'warn', 'error'], query: 'alice', createdAt: 1,
    });
    const { getAllByRole, getByLabelText, getByText } = render(() => <OperConsole onClose={vi.fn()} />);

    expect(getByText('Correlated Event Timeline (2/2)')).toBeInTheDocument();
    const alicePivots = getAllByRole('button', { name: 'alice' });
    fireEvent.click(alicePivots[0]!);
    expect(getByRoleButton('Clear incident pivot alice')).toBeInTheDocument();
    expect(getByText('Correlated Event Timeline (2/2)')).toBeInTheDocument();

    fireEvent.input(getByLabelText('Incident view name'), { target: { value: 'Alice incident' } });
    fireEvent.input(getByLabelText('Event feed query'), { target: { value: 'alice' } });
    fireEvent.click(getByRoleButton('Save view'));
    expect(mocks.saveIncidentFilter).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Alice incident', query: 'alice', severities: ['info', 'notice', 'warn', 'error'],
    }));
  });

  it('keeps destructive confirmation and credentials until relay dispatch succeeds', () => {
    mocks.sendTo.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { getByLabelText } = render(() => <OperConsole onClose={vi.fn()} />);

    fireEvent.input(getByLabelText('KILL target nick'), { target: { value: 'alice' } });
    fireEvent.input(getByLabelText('KILL reason'), { target: { value: 'flooding' } });
    fireEvent.click(getByRoleButton('Review KILL'));
    expect(mocks.sendTo).not.toHaveBeenCalled();

    const confirm = getByRoleButton('Send destructive command') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    fireEvent.input(getByLabelText('Type alice to confirm'), { target: { value: 'Alice' } });
    expect(confirm).toBeDisabled();
    fireEvent.input(getByLabelText('Type alice to confirm'), { target: { value: 'alice' } });
    fireEvent.click(confirm);
    expect(mocks.sendTo).toHaveBeenCalledWith('server', '/quote KILL alice :flooding');
    expect(getByLabelText('Type alice to confirm')).toBeInTheDocument();
    expect(getByLabelText('KILL target nick')).toHaveValue('alice');
    expect(getByLabelText('KILL reason')).toHaveValue('flooding');
    expect(mocks.recordOperatorCommand).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    expect(mocks.sendTo).toHaveBeenCalledTimes(2);
    expect(mocks.recordOperatorCommand).toHaveBeenCalledWith(expect.objectContaining({ target: 'alice', destructive: true }));
    expect(getByLabelText('KILL target nick')).toHaveValue('');
    expect(getByLabelText('KILL reason')).toHaveValue('');
    expect(document.querySelector('[aria-labelledby="destructive-confirm-title"]')).not.toBeInTheDocument();

    fireEvent.input(getByLabelText('WARD arguments'), { target: { value: 'ADD MASK *!*@bad.host GLOBAL BAN :spam' } });
    fireEvent.click(getByRoleButton('Send', 0));
    expect(mocks.sendTo).toHaveBeenCalledTimes(2);
    fireEvent.input(getByLabelText('Type *!*@bad.host to confirm'), { target: { value: '*!*@bad.host' } });
    fireEvent.click(getByRoleButton('Send destructive command'));
    expect(mocks.sendTo).toHaveBeenLastCalledWith('server', '/quote WARD ADD MASK *!*@bad.host GLOBAL BAN :spam');
  });

  it('sends ordinary raw commands immediately but stages destructive raw commands', () => {
    const { getByLabelText } = render(() => <OperConsole onClose={vi.fn()} />);
    const raw = getByLabelText('Raw IRC command');
    fireEvent.input(raw, { target: { value: 'STATS u' } });
    fireEvent.keyDown(raw, { key: 'Enter' });
    expect(mocks.sendTo).toHaveBeenCalledWith('server', '/quote STATS u');

    fireEvent.input(raw, { target: { value: 'SQUIT leaf.example maintenance' } });
    fireEvent.keyDown(raw, { key: 'Enter' });
    expect(mocks.sendTo).toHaveBeenCalledTimes(1);
    expect(getByLabelText('Type leaf.example to confirm')).toBeInTheDocument();
  });

  it('retains raw and broadcast input and skips audit until each dispatch is accepted', () => {
    mocks.sendTo
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { getByLabelText } = render(() => <OperConsole onClose={vi.fn()} />);
    const raw = getByLabelText('Raw IRC command');
    const broadcast = getByLabelText('Operator broadcast');

    fireEvent.input(raw, { target: { value: 'OPER secret-password' } });
    fireEvent.keyDown(raw, { key: 'Enter' });
    expect(raw).toHaveValue('OPER secret-password');
    expect(mocks.recordOperatorCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(raw, { key: 'Enter' });
    expect(raw).toHaveValue('');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(1);

    fireEvent.input(broadcast, { target: { value: 'Network maintenance' } });
    fireEvent.keyDown(broadcast, { key: 'Enter' });
    expect(broadcast).toHaveValue('Network maintenance');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(broadcast, { key: 'Enter' });
    expect(broadcast).toHaveValue('');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(2);
  });

  it('only toggles subscriptions and severity after relay acceptance', () => {
    mocks.sendTo
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { getByRole } = render(() => <OperConsole onClose={vi.fn()} />);
    const connect = getByRole('checkbox', { name: 'CONNECT' });

    fireEvent.click(connect);
    expect(connect).not.toBeChecked();
    expect(mocks.recordOperatorCommand).not.toHaveBeenCalled();
    fireEvent.click(connect);
    expect(connect).toBeChecked();
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole('button', { name: 'warn' }));
    expect(getByRole('button', { name: 'warn' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(getByRoleButton('Apply'));
    expect(getByRole('button', { name: 'info' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole('button', { name: 'warn' }));
    fireEvent.click(getByRoleButton('Apply'));
    expect(getByRole('button', { name: 'warn' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(2);
  });

  it('applies only acknowledged portions of a saved multi-command filter', () => {
    mocks.filters.push({
      id: 'security',
      name: 'Security',
      categories: ['CONNECT', 'DISCONNECT'],
      severities: ['warn', 'error'],
      query: 'alice',
      createdAt: 1,
    });
    mocks.sendTo
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    const { getByLabelText, getByRole } = render(() => <OperConsole onClose={vi.fn()} />);
    const saved = getByRole('button', { name: 'Security' });

    fireEvent.click(saved);
    expect(getByRole('checkbox', { name: 'CONNECT' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'DISCONNECT' })).not.toBeChecked();
    expect(getByRole('button', { name: 'warn' })).toHaveAttribute('aria-pressed', 'true');
    expect(saved).toHaveAttribute('aria-pressed', 'false');
    expect(getByLabelText('Event feed query')).toHaveValue('');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(2);

    fireEvent.click(saved);
    expect(getByRole('checkbox', { name: 'CONNECT' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'DISCONNECT' })).toBeChecked();
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Event feed query')).toHaveValue('alice');
    expect(mocks.recordOperatorCommand).toHaveBeenCalledTimes(4);
  });
});

function getByRoleButton(name: string, index?: number): HTMLElement {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => button.textContent?.trim() === name || button.getAttribute('aria-label') === name);
  const button = buttons[index ?? 0];
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}
