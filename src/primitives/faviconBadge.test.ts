// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupFaviconBadge } from './faviconBadge';

class StubImage {
  static instances: StubImage[] = [];

  crossOrigin: string | null = null;
  onload: ((event: Event) => void) | null = null;
  src = '';

  constructor() {
    StubImage.instances.push(this);
  }

  triggerLoad(): void {
    this.onload?.(new Event('load'));
  }
}

function installIconLink(): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/darkbear/favicon.svg';
  document.head.append(link);
  return link;
}

function installCanvasStub(): {
  drawImage: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
} {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  const toDataURL = vi.fn(() => 'data:image/png;base64,badge');

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL);

  return {
    drawImage: context.drawImage,
    fill: context.fill,
    fillText: context.fillText,
    toDataURL,
  };
}

describe('setupFaviconBadge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    StubImage.instances = [];
    document.head.replaceChildren();
  });

  it('renders numeric counts after the base favicon loads', () => {
    const link = installIconLink();
    const canvas = installCanvasStub();
    vi.stubGlobal('Image', StubImage);

    const cleanup = setupFaviconBadge(() => 3);

    expect(StubImage.instances[0]?.crossOrigin).toBe('anonymous');
    expect(StubImage.instances[0]?.src).toBe('/darkbear/favicon.svg');
    expect(link.href).toContain('/darkbear/favicon.svg');

    StubImage.instances[0]?.triggerLoad();

    expect(canvas.drawImage).toHaveBeenCalled();
    expect(canvas.fillText).toHaveBeenCalledWith('3', 24, 9);
    expect(link.href).toBe('data:image/png;base64,badge');

    cleanup();
    expect(link.href).toContain('/darkbear/favicon.svg');
  });

  it('renders counts above nine as a dot without badge text', () => {
    const link = installIconLink();
    const canvas = installCanvasStub();
    vi.stubGlobal('Image', StubImage);

    const cleanup = setupFaviconBadge(() => 10);

    StubImage.instances[0]?.triggerLoad();

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(canvas.fill).toHaveBeenCalled();
    expect(canvas.fillText).not.toHaveBeenCalled();
    expect(link.href).toBe('data:image/png;base64,badge');

    cleanup();
  });

  it('returns a harmless cleanup when no favicon link exists', () => {
    const cleanup = setupFaviconBadge(() => 1);

    expect(cleanup).toBeTypeOf('function');
    expect(() => cleanup()).not.toThrow();
  });
});
