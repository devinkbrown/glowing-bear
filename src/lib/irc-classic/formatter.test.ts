import { describe, it, expect } from 'vitest';

import { formatText, extractEmbeds, stripFormatting, MAX_FORMAT_LENGTH } from './formatter';

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

  it('supports extended 0-98 palette background codes', () => {
    expect(formatText('\x0352,98hot')).toBe('<span class="irc-fg-52 irc-bg-98">hot</span>');
  });

  it('swaps foreground and background while reverse video is active', () => {
    expect(formatText('\x0304,08normal \x16reverse\x16 normal')).toBe(
      '<span class="irc-fg-4 irc-bg-8">normal </span><span class="irc-fg-8 irc-bg-4">reverse</span><span class="irc-fg-4 irc-bg-8"> normal</span>',
    );
  });

  it('renders reverse video without explicit colors', () => {
    expect(formatText('a \x16rev\x16 b')).toBe('a <span class="irc-reverse">rev</span> b');
  });

  it('supports mIRC hex colors', () => {
    expect(formatText('\x04ff6600,001122hex')).toBe(
      '<span style="color:#ff6600;background-color:#001122">hex</span>',
    );
  });

  it('renders WeeChat relay foreground colors translated from IRC formatting', () => {
    expect(formatText('\x19F04red')).toBe('<span style="color:#ff5555">red</span>');
  });

  it('renders WeeChat relay foreground/background color pairs', () => {
    expect(formatText('\x19*04,08warn')).toBe('<span style="color:#ff5555;background-color:#ffff55">warn</span>');
  });

  it('resets WeeChat relay colors with the internal reset pair', () => {
    expect(formatText('\x19F04red\x19\x1c plain')).toBe('<span style="color:#ff5555">red</span> plain');
  });

  it('renders WeeChat option-color controls from live relay buffer lines', () => {
    expect(formatText('\x1928(\x1927host\x1928)')).toBe(
      '<span style="color:#16a34a">(</span><span style="color:#55ffff">host</span><span style="color:#16a34a">)</span>',
    );
  });

  it('treats WeeChat chat-text option 01 as default text, not black or white', () => {
    expect(formatText('\x19F@00176colored\x1901 plain')).toBe(
      '<span style="color:#d787d7">colored</span> plain',
    );
  });

  it('renders ANSI colors returned by the WeeChat relay default', () => {
    expect(formatText('\x1b[31mred\x1b[0m plain')).toBe('<span style="color:#cd0000">red</span> plain');
  });

  it('renders ANSI 256-color foreground/background pairs', () => {
    expect(formatText('\x1b[38;5;196;48;5;22mhot\x1b[0m')).toBe(
      '<span style="color:#ff0000;background-color:#005f00">hot</span>',
    );
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

describe('formatText — hostile scheme / attribute safety', () => {
  it('never produces an href for a javascript: / data: / vbscript: scheme', () => {
    for (const payload of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      const out = formatText(payload);
      expect(out).not.toMatch(/href="javascript:/i);
      expect(out).not.toMatch(/href="data:/i);
      expect(out).not.toMatch(/href="vbscript:/i);
      expect(out).not.toContain('<a ');
    }
  });

  it('does not break out of the data-channel attribute via a crafted channel ref', () => {
    const out = formatText('#chan"><img onerror=alert(1)>');
    // The <img stays escaped inert text; no live tag, no attribute breakout.
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('"><img');
    // The channel ref is confined to a restricted-charset data-channel value.
    expect(out).toContain('data-channel="#chan"');
  });
});

describe('formatText / extractEmbeds — input length cap (DoS bound)', () => {
  it('exposes a hard cap constant', () => {
    expect(MAX_FORMAT_LENGTH).toBeGreaterThan(0);
  });

  it('truncates a pathological long line and never renders content past the cap', () => {
    const sentinel = 'PASTCAPSENTINEL';
    const out = formatText('a'.repeat(MAX_FORMAT_LENGTH) + sentinel);
    expect(out).not.toContain(sentinel);
    expect(out).toContain('…');
    // Worst-case escape expansion is ~6x; output must stay bounded by the cap.
    expect(out.length).toBeLessThan(MAX_FORMAT_LENGTH * 8);
  });

  it('does not stall formatText on a hostile multi-KB URL-shaped line', () => {
    const payload = 'https://youtube.com/watch?' + 'a'.repeat(200_000);
    const start = performance.now();
    const out = formatText(payload);
    expect(typeof out).toBe('string');
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('extractEmbeds ignores URLs positioned entirely past the cap', () => {
    const embeds = extractEmbeds(`${'x'.repeat(MAX_FORMAT_LENGTH)} https://youtu.be/dQw4w9WgXcQ`);
    expect(embeds).toEqual([]);
  });

  it('does not stall extractEmbeds on a hostile multi-KB line', () => {
    const payload = 'https://youtube.com/watch?' + 'a'.repeat(200_000);
    const start = performance.now();
    const embeds = extractEmbeds(payload);
    expect(Array.isArray(embeds)).toBe(true);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('still extracts a valid embed that fits within the cap', () => {
    expect(extractEmbeds('watch https://youtu.be/dQw4w9WgXcQ now')).toEqual([
      { type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 0 },
    ]);
  });
});

describe('stripFormatting', () => {
  it('removes toggle codes and color sequences with digits', () => {
    expect(stripFormatting('\x02bold\x02 \x0304,07red\x0f done')).toBe('bold red done');
  });

  it('removes reverse and hex color controls', () => {
    expect(stripFormatting('\x16rev\x16 \x04ff6600,001122hex')).toBe('rev hex');
  });

  it('removes WeeChat relay color controls', () => {
    expect(stripFormatting('\x19F04red \x19*04,08warn\x19\x1c plain')).toBe('red warn plain');
  });

  it('removes ANSI color controls', () => {
    expect(stripFormatting('\x1b[31mred\x1b[0m plain')).toBe('red plain');
  });

  it('removes italic, underline, strike, and mono codes', () => {
    expect(stripFormatting('\x1da\x1f b\x1e c\x11 d')).toBe('a b c d');
  });

  it('leaves plain text untouched', () => {
    expect(stripFormatting('nothing fancy 12,34')).toBe('nothing fancy 12,34');
  });
});
