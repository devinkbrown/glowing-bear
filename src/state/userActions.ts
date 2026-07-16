import { createSignal } from 'solid-js';
import type { SafeCommandId, UserCommandAction } from '@/types';
import {
  MAX_USER_ACTIONS,
  expandSafeCommand,
  isSafeCommandId,
  type SafeCommandExpansion,
} from '@/lib/userActions';
import { sendInput } from './connection';
import { settings, updateSettings } from './settings';

const [activeUserActionId, setActiveUserActionId] = createSignal<string | null>(null);
export { activeUserActionId };

function newActionId(): string {
  try {
    return `ua-${crypto.randomUUID()}`;
  } catch {
    return `ua-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function endpointMatchesProfile(profileName: string): boolean {
  const profile = settings.profiles.find((candidate) => candidate.name === profileName);
  if (!profile) return false;
  return profile.relay.host.trim().toLocaleLowerCase() === settings.relay.host.trim().toLocaleLowerCase() &&
    profile.relay.port === settings.relay.port && profile.relay.tls === settings.relay.tls;
}

export function userActionApplies(action: UserCommandAction): boolean {
  if (action.scope === 'global') return true;
  if (!action.scope.startsWith('profile:')) return false;
  return endpointMatchesProfile(action.scope.slice('profile:'.length));
}

export function visibleUserActions(): UserCommandAction[] {
  return settings.userActions.filter(userActionApplies);
}

export function createUserAction(
  name: string,
  commandId: SafeCommandId,
  scope = 'global',
): UserCommandAction | null {
  const normalizedName = name.trim().slice(0, 80);
  const normalizedScope = scope === 'global' ||
    (scope.startsWith('profile:') && settings.profiles.some((profile) => `profile:${profile.name}` === scope))
    ? scope.slice(0, 120)
    : 'global';
  if (!normalizedName || !isSafeCommandId(commandId) || settings.userActions.length >= MAX_USER_ACTIONS) {
    return null;
  }
  const action: UserCommandAction = {
    id: newActionId(),
    name: normalizedName,
    commandId,
    scope: normalizedScope,
    confirmed: false,
  };
  updateSettings({ userActions: [...settings.userActions, action] });
  return action;
}

export function deleteUserAction(id: string): void {
  updateSettings({ userActions: settings.userActions.filter((action) => action.id !== id) });
  if (activeUserActionId() === id) setActiveUserActionId(null);
}

export function clearUserActions(): void {
  updateSettings({ userActions: [] });
  setActiveUserActionId(null);
}

export function beginUserAction(id: string): void {
  if (visibleUserActions().some((action) => action.id === id)) setActiveUserActionId(id);
}

export function closeUserAction(): void {
  setActiveUserActionId(null);
}

export function activeUserAction(): UserCommandAction | null {
  const id = activeUserActionId();
  return settings.userActions.find((action) => action.id === id) ?? null;
}

function markUserActionConfirmed(id: string): void {
  updateSettings({
    userActions: settings.userActions.map((action) =>
      action.id === id ? { ...action, confirmed: true } : action,
    ),
  });
}

export function runUserAction(
  id: string,
  values: Readonly<Record<string, string>>,
): SafeCommandExpansion {
  const action = settings.userActions.find((candidate) => candidate.id === id);
  if (!action || !userActionApplies(action)) return { ok: false, reason: 'This action is not available for the current profile.' };
  const expansion = expandSafeCommand(action.commandId, values);
  if (!expansion.ok) return expansion;
  if (!sendInput(expansion.command)) {
    return {
      ok: false,
      reason: 'Relay is not connected. Your action remains open for retry.',
    };
  }
  if (!action.confirmed) markUserActionConfirmed(id);
  setActiveUserActionId(null);
  return expansion;
}
