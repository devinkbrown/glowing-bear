import { describe, it, expect } from 'vitest';

import { formatText, extractEmbeds, stripFormatting } from './formatter';

describe('formatText — formatting toggles', () => {
  it('renders bold spans and toggles off', () => {
    expect(formatText('\x02bold\x02 normal')).toBe('<span class="irc-bold">bold</span> normal');
  });

  it('renders italic, underline, strikethrough, and monospace spans', () => {
    expect(formatText('\x1ditalic\x1d')).toBe('<span class="irc-italic">italic</span>');
    expect(formatText('\x1funder\x1f')).toBe('<span class="irc-underline">under</span>');
    expect(formatText('\x1estrike\x1e')).toBe('<span class="irc-strikethrough">strike</span>');
    expect(formatText('\x11mono\x11')).toBe('<span class="irc-mono">mono</span>');
  });

  it('nests bold and italic as stacked class spans', () => {
    expect(formatText('\x02bold \x1dboth\x1d rest\x02')).toBe(
      '<span class="irc-bold">bold </span><span class="irc-bold irc-italic">both</span><span class="irc-bold"> rest</span>',
    );
  });

  it('resets everything at \\x0f', () => {
    // Consecutive toggle codes (\x02 then \x03) leave a harmless empty span
    // before the combined one; the reset must still drop all styling after it.
    expect(formatText('\x02\x034bold red\x0fplain')).toBe(
      '<span class="irc-bold"></span><span class="irc-bold irc-fg-4">bold red</span>plain',
    );
  });
});

describe('formatText — mIRC colors', () => {
  it('applies a single-digit foreground color', () => {
    expect(formatText('\x033green\x03 plain')).toBe('<span class="irc-fg-3">green</span> plain');
  });

  it('parses two-digit foreground codes', () => {
    expect(formatText('\x0304red')).toBe('<span class="irc-fg-4">red</span>');
  });

  it('applies foreground and background from fg,bg', () => {
    expect(formatText('\x034,8warn')).toBe('<span class="irc-fg-4 irc-bg-8">warn</span>');
  });

  it('treats bare \\x03 as a color reset', () => {
    expect(formatText('\x033green\x03plain')).toBe('<span class="irc-fg-3">green</span>plain');
  });

  it('does not treat a comma without digits as a background', () => {
    expect(formatText('\x034,text')).toBe('<span class="irc-fg-4">,text</span>');
  });

  it('drops classes for colors beyond the valid range', () => {
    expect(formatText('\x0399text')).toBe('text');
  });
});

describe('formatText — HTML escaping (XSS)', () => {
  it('escapes <script> so markup never survives into the output', () => {
    const out = formatText('<script>alert("x")</script>');

    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&quot;x&quot;');
  });

  it('escapes all of & < > " and single quote', () => {
    expect(formatText('a&b')).toContain('a&amp;b');
    expect(formatText("it's")).toContain('it&#39;s');
    expect(formatText('1 < 2 > 0')).toContain('1 &lt; 2 &gt; 0');
  });

  it('escapes ampersands inside linkified URLs', () => {
    const out = formatText('https://example.com/?a=1&b=2');
    expect(out).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(out).not.toContain('?a=1&b=2"');
  });
});

describe('formatText — URL linkification and images', () => {
  it('turns a plain URL into a safe external link', () => {
    expect(formatText('see https://example.com/page now')).toBe(
      'see <a href="https://example.com/page" target="_blank" rel="noopener noreferrer" class="irc-link">https://example.com/page</a> now',
    );
  });

  it('renders image-extension URLs as links when inline images are off', () => {
    const out = formatText('https://example.com/cat.png', false);
    expect(out).toContain('<a href="https://example.com/cat.png"');
    expect(out).not.toContain('<img');
  });

  it('inlines image-extension URLs when inline images are on', () => {
    const out = formatText('https://example.com/cat.png', true);
    expect(out).toContain('<img src="https://example.com/cat.png"');
    expect(out).toContain('class="irc-inline-image"');
  });

  it('treats allowlisted image hosts as images even without an extension', () => {
    const out = formatText('https://i.imgur.com/abcd123', true);
    expect(out).toContain('<img src="https://i.imgur.com/abcd123"');
  });

  it('does not inline images from arbitrary hosts without an image extension', () => {
    const out = formatText('https://evil.example/abcd123', true);
    expect(out).not.toContain('<img');
  });

  it('rewrites imgur short URLs to i.imgur.com while displaying the original', () => {
    const out = formatText('https://imgur.com/AbCd123', true);
    expect(out).toContain('<img src="https://i.imgur.com/AbCd123.jpg"');
    expect(out).toContain('alt="https://imgur.com/AbCd123"');
  });
});

describe('formatText — inline annotations', () => {
  it('wraps backtick spans in <code>', () => {
    expect(formatText('run `ls -la` now')).toBe('run <code class="irc-code">ls -la</code> now');
  });

  it('appends a color swatch after a 6-digit hex color', () => {
    const out = formatText('try #ff0000 now');
    expect(out).toContain('class="irc-color-swatch"');
    expect(out).toContain('background:#ff0000');
  });

  it('appends a color swatch after a 3-digit hex color', () => {
    const out = formatText('bg is #abc here');
    expect(out).toContain('background:#abc');
  });

  it('wraps channel references in clickable buttons', () => {
    expect(formatText('join #general please')).toContain(
      '<button class="irc-chan-ref" data-channel="#general">#general</button>',
    );
  });

  it('recognizes ##doubled channel names', () => {
    expect(formatText('see ##meta')).toContain('data-channel="##meta"');
  });
});

describe('extractEmbeds', () => {
  it('extracts a youtube embed with an h/m/s start offset', () => {
    expect(extractEmbeds('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toEqual([
      { type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 3723 },
    ]);
  });

  it('extracts a youtu.be short link with a bare seconds t=', () => {
    expect(extractEmbeds('https://youtu.be/dQw4w9WgXcQ?t=43')).toEqual([
      { type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 43 },
    ]);
  });

  it('defaults the youtube start to 0 without a t= param', () => {
    expect(extractEmbeds('https://youtu.be/dQw4w9WgXcQ')).toEqual([
      { type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 0 },
    ]);
  });

  it('extracts a twitch clip', () => {
    expect(extractEmbeds('https://clips.twitch.tv/FunnyClipName-abc_123')).toEqual([
      { type: 'twitch_clip', clipId: 'FunnyClipName-abc_123' },
    ]);
  });

  it('extracts a twitch stream channel', () => {
    expect(extractEmbeds('https://www.twitch.tv/somestreamer')).toEqual([
      { type: 'twitch_stream', channelId: 'somestreamer', videoId: undefined },
    ]);
  });

  it('extracts video and audio file embeds by extension', () => {
    expect(extractEmbeds('https://example.com/clip.mp4')).toEqual([
      { type: 'video', url: 'https://example.com/clip.mp4' },
    ]);
    expect(extractEmbeds('https://example.com/song.mp3?x=1')).toEqual([
      { type: 'audio', url: 'https://example.com/song.mp3?x=1' },
    ]);
  });

  it('collects multiple embeds from one message in order', () => {
    const embeds = extractEmbeds(
      'watch https://youtu.be/dQw4w9WgXcQ then https://example.com/clip.mp4',
    );
    expect(embeds.map((e) => e.type)).toEqual(['youtube', 'video']);
  });

  it('returns an empty array when no media URLs are present', () => {
    expect(extractEmbeds('nothing to see here')).toEqual([]);
    expect(extractEmbeds('plain link https://example.com/page')).toEqual([]);
  });
});

describe('stripFormatting', () => {
  it('removes toggle codes and color sequences with digits', () => {
    expect(stripFormatting('\x02bold\x02 \x0304,07red\x0f done')).toBe('bold red done');
  });

  it('removes italic, underline, strike, and mono codes', () => {
    expect(stripFormatting('\x1da\x1f b\x1e c\x11 d')).toBe('a b c d');
  });

  it('leaves plain text untouched', () => {
    expect(stripFormatting('nothing fancy 12,34')).toBe('nothing fancy 12,34');
  });
});
