// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { useClickOutside } from './clickOutside';

describe('useClickOutside', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('fires the callback for outside pointer events but not inside events', () => {
    // Arrange
    const onOutside = vi.fn();
    let root: HTMLDivElement | undefined;
    render(() => {
      root = document.createElement('div');
      useClickOutside(() => root, onOutside);
      return root;
    });
    const outside = document.createElement('button');
    document.body.append(outside);

    // Act
    root?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    outside.dispatchEvent(new Event('touchstart', { bubbles: true }));

    // Assert
    expect(onOutside).toHaveBeenCalledTimes(2);
  });

  it('does not fire when the element accessor is disabled', () => {
    // Arrange
    const onOutside = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    render(() => {
      useClickOutside(() => undefined, onOutside);
      return document.createElement('div');
    });

    // Act
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    // Assert
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('removes document listeners on disposal', () => {
    // Arrange
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    let root: HTMLDivElement | undefined;

    render(() => {
      root = document.createElement('div');
      useClickOutside(() => root, vi.fn());
      return root;
    });

    const mousedownHandler = addSpy.mock.calls.find(([type]) => type === 'mousedown')?.[1];
    const touchstartHandler = addSpy.mock.calls.find(([type]) => type === 'touchstart')?.[1];

    // Act
    cleanup();

    // Assert
    expect(removeSpy).toHaveBeenCalledWith('mousedown', mousedownHandler);
    expect(removeSpy).toHaveBeenCalledWith('touchstart', touchstartHandler);
  });
});
