// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { createSwipeGesture } from './swipe';

function touchEvent(type: 'touchstart' | 'touchend', clientX: number, clientY: number): TouchEvent {
  const event = new Event(type, { bubbles: true }) as TouchEvent;
  const touch = { clientX, clientY } as Touch;
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: type === 'touchstart' ? [touch] : [],
  });
  Object.defineProperty(event, 'changedTouches', {
    configurable: true,
    value: [touch],
  });
  return event;
}

function swipe(
  target: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  elapsedMs = 120,
): void {
  const now = vi.spyOn(Date, 'now');
  now.mockReturnValueOnce(1000).mockReturnValueOnce(1000 + elapsedMs);
  target.dispatchEvent(touchEvent('touchstart', start.x, start.y));
  target.dispatchEvent(touchEvent('touchend', end.x, end.y));
  now.mockRestore();
}

describe('createSwipeGesture', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('fires the left callback for a qualifying horizontal swipe', () => {
    // Arrange
    const target = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    render(() => {
      createSwipeGesture(() => target, { onSwipeLeft, onSwipeRight });
      return target;
    });

    // Act
    swipe(target, { x: 120, y: 20 }, { x: 40, y: 25 });

    // Assert
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('fires the right callback only when the swipe starts inside the edge', () => {
    // Arrange
    const target = document.createElement('div');
    const onSwipeRight = vi.fn();
    render(() => {
      createSwipeGesture(() => target, { onSwipeRight, edgePx: 30 });
      return target;
    });

    // Act
    swipe(target, { x: 15, y: 20 }, { x: 95, y: 24 });
    swipe(target, { x: 45, y: 20 }, { x: 125, y: 24 });

    // Assert
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('ignores nonqualifying swipes', () => {
    // Arrange
    const target = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    render(() => {
      createSwipeGesture(() => target, { onSwipeLeft, onSwipeRight });
      return target;
    });

    // Act
    swipe(target, { x: 120, y: 20 }, { x: 85, y: 22 });
    swipe(target, { x: 20, y: 20 }, { x: 110, y: 85 });

    // Assert
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('removes touch listeners on disposal', () => {
    // Arrange
    const target = document.createElement('div');
    const addSpy = vi.spyOn(target, 'addEventListener');
    const removeSpy = vi.spyOn(target, 'removeEventListener');
    render(() => {
      createSwipeGesture(() => target, { onSwipeLeft: vi.fn() });
      return target;
    });

    const touchstartHandler = addSpy.mock.calls.find(([type]) => type === 'touchstart')?.[1];
    const touchendHandler = addSpy.mock.calls.find(([type]) => type === 'touchend')?.[1];

    // Act
    cleanup();

    // Assert
    expect(removeSpy).toHaveBeenCalledWith('touchstart', touchstartHandler);
    expect(removeSpy).toHaveBeenCalledWith('touchend', touchendHandler);
  });
});
