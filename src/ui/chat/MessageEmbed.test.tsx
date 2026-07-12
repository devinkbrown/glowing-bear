// MessageEmbed render tests — lazy iframe players and direct media elements.
// Safety cases exercise the live extractEmbeds -> MessageEmbed contract.

import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { extractEmbeds, type MediaEmbed } from '@/lib/irc-classic/formatter';
import MessageEmbed from './MessageEmbed';

function renderEmbed(embed: MediaEmbed) {
  return render(() => <MessageEmbed embed={embed} />);
}

function loadLazyFrame(container: HTMLElement, label: RegExp): HTMLIFrameElement {
  const button = container.querySelector('button');
  expect(button).not.toBeNull();
  expect(button).toHaveAccessibleName(label);

  fireEvent.click(button!);

  const iframe = container.querySelector('iframe');
  expect(iframe).not.toBeNull();
  return iframe!;
}

function renderFirstExtractedEmbed(text: string) {
  const embeds = extractEmbeds(text);
  return {
    embeds,
    ...render(() => <>{embeds[0] ? <MessageEmbed embed={embeds[0]} /> : null}</>),
  };
}

function liveUrls(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[href], [src]')).flatMap((element) => [
    element.getAttribute('href') ?? element.getAttribute('src') ?? '',
  ]);
}

afterEach(() => {
  cleanup();
});

describe('MessageEmbed', () => {
  it('renders a click-to-load YouTube nocookie iframe with the expected video id', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 43 };

    // Act
    const { container } = renderEmbed(embed);
    const iframe = loadLazyFrame(container, /load youtube video/i);

    // Assert
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&start=43',
    );
    expect(iframe).toHaveAttribute('title', 'YouTube video');
  });

  it('renders a click-to-load Twitch clip iframe with the expected clip id', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'twitch_clip', clipId: 'ReliableClipId_42' };

    // Act
    const { container } = renderEmbed(embed);
    const iframe = loadLazyFrame(container, /load twitch clip/i);
    const src = iframe.getAttribute('src') ?? '';

    // Assert
    expect(src).toContain('https://clips.twitch.tv/embed?clip=ReliableClipId_42');
    expect(src).toContain('&parent=');
    expect(src).toContain('&autoplay=true');
    expect(iframe).toHaveAttribute('title', 'Twitch clip');
  });

  it('renders a click-to-load Twitch stream iframe with the expected channel id', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'twitch_stream', channelId: 'darkbear_dev' };

    // Act
    const { container } = renderEmbed(embed);
    const iframe = loadLazyFrame(container, /load twitch stream/i);
    const src = iframe.getAttribute('src') ?? '';

    // Assert
    expect(src).toContain('https://player.twitch.tv/?channel=darkbear_dev');
    expect(src).toContain('&parent=');
    expect(src).toContain('&autoplay=true');
    expect(iframe).toHaveAttribute('title', 'Twitch stream');
  });

  it('renders a direct video URL as a video element', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'video', url: 'https://media.example.test/demo.webm' };

    // Act
    const { container } = renderEmbed(embed);
    const video = container.querySelector('video');

    // Assert
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://media.example.test/demo.webm');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'metadata');
  });

  it('renders a direct audio URL as an audio element', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'audio', url: 'https://media.example.test/demo.opus' };

    // Act
    const { container } = renderEmbed(embed);
    const audio = container.querySelector('audio');

    // Assert
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute('src', 'https://media.example.test/demo.opus');
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('preload', 'metadata');
  });

  it('does not render a live href or src for non-http URL schemes from extracted text', () => {
    // Arrange
    const unsafeInputs = [
      'javascript:alert(1)',
      'data:text/html,<svg onload=alert(1)>',
      'vbscript:msgbox(1)',
      'ftp://example.test/movie.mp4',
    ];

    for (const input of unsafeInputs) {
      // Act
      const { embeds, container, unmount } = renderFirstExtractedEmbed(input);

      // Assert
      expect(embeds).toHaveLength(0);
      expect(container.querySelector('a, iframe, img, video, audio')).toBeNull();
      expect(liveUrls(container).some((url) => /^(?:javascript|data|vbscript|ftp):/i.test(url))).toBe(false);

      unmount();
    }
  });

  it('does not render a live media element for a non-http(s) direct video/audio url', () => {
    // Arrange — a hostile MediaEmbed fed straight to the render boundary,
    // bypassing extractEmbeds' URL_RE_SRC scheme gate.
    const hostileUrls = ['javascript:alert(1)', 'data:text/html,<svg onload=alert(1)>', 'vbscript:msgbox(1)'];

    for (const url of hostileUrls) {
      for (const type of ['video', 'audio'] as const) {
        // Act
        const { container, unmount } = renderEmbed({ type, url } as MediaEmbed);

        // Assert — fail closed: no live element, no smuggled scheme in any src.
        expect(container.querySelector('video, audio, a, iframe, img')).toBeNull();
        expect(liveUrls(container).some((u) => /^(?:javascript|data|vbscript):/i.test(u))).toBe(false);

        unmount();
      }
    }
  });

  it('renders a normal https direct video url as a live element (scheme guard allows http(s))', () => {
    // Arrange
    const embed: MediaEmbed = { type: 'video', url: 'https://media.example.test/clip.mp4' };

    // Act
    const { container } = renderEmbed(embed);
    const video = container.querySelector('video');

    // Assert
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://media.example.test/clip.mp4');
  });

  it('binds hostile embed metadata as inert attribute data, never as injected markup', () => {
    // Arrange — a YouTube id crafted to break out of the poster/src attribute.
    const embed: MediaEmbed = {
      type: 'youtube',
      videoId: 'x"><img src=y onerror=alert(1)><script>alert(2)</script>',
      start: 0,
    };

    // Act
    const { container } = renderEmbed(embed);

    // Assert — Solid sets the poster src via setAttribute, so the payload is
    // attribute data, not parsed HTML: exactly the one poster <img>, no script,
    // no element carrying an onerror handler.
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });

  it('renders nothing for image and plain URLs because they are not MessageEmbed types', () => {
    // Arrange
    const imageUrl = 'https://media.example.test/still.png';
    const plainUrl = 'https://example.test/readme';

    // Act
    const imageResult = renderFirstExtractedEmbed(imageUrl);
    const plainResult = renderFirstExtractedEmbed(plainUrl);

    // Assert
    expect(imageResult.embeds).toHaveLength(0);
    expect(imageResult.container.querySelector('img, iframe, video, audio')).toBeNull();
    expect(plainResult.embeds).toHaveLength(0);
    expect(plainResult.container.querySelector('img, iframe, video, audio')).toBeNull();

    imageResult.unmount();
    plainResult.unmount();
  });

  it('renders nothing for an unrecognized embed type', () => {
    // Arrange
    const embed = { type: 'unknown', url: 'https://example.test/readme' } as unknown as MediaEmbed;

    // Act
    const { container } = renderEmbed(embed);

    // Assert
    expect(container.querySelector('a, iframe, img, video, audio')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
