'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import type { WeeChatLine } from '@/types';
import { nickColor } from '@/lib/nickcolor';
import { formatTimestamp } from '@/lib/timestamps';
import { formatText } from '@/protocol/irc/formatter';
import { stripColors } from '@/protocol/weechat/strip-colors';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface Props {
  line: WeeChatLine;
  grouped: boolean;
  compact: boolean;
  timestampFormat: '12h' | '24h' | 'off' | 'relative';
  colorNicks: boolean;
  showPrefixes: boolean;
  inlineImages: boolean;
}

const IMAGE_RE = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;
const URL_RE = /https?:\/\/[^\s<"']+/g;

interface ContextMenu {
  x: number;
  y: number;
  text: string;
  urls: string[];
}

function MessageContextMenu({ menu, onClose }: { menu: ContextMenu; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click (handled via portal-like overlay)
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} onTouchStart={onClose} />
      <div ref={menuRef} className="fixed z-[100] animate-fade-up"
        style={{
          left: `${Math.min(menu.x, window.innerWidth - 180)}px`,
          top: `${Math.min(menu.y, window.innerHeight - 160)}px`,
        }}>
        <div className="bg-gray-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden min-w-[150px]">
          <div className="py-1">
            <button
              onClick={() => {
                navigator.clipboard.writeText(menu.text).catch(() => {});
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors">
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5" />
              </svg>
              Copy Text
            </button>
            {menu.urls.length > 0 && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(menu.urls[0]).catch(() => {});
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6.5 9.5l3-3M7 10a3 3 0 01-4.24 0 3 3 0 010-4.24L4.5 4M9 6a3 3 0 014.24 0 3 3 0 010 4.24L11.5 12" />
                </svg>
                Copy Link
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function MessageLine({ line, grouped, compact, timestampFormat, colorNicks, showPrefixes, inlineImages }: Props) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const timestamp = timestampFormat !== 'off' ? formatTimestamp(line.date, timestampFormat) : '';
  const nick = line.nick ?? '';
  const nickStyle = colorNicks && nick ? { color: nickColor(nick) } : undefined;

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef({ x: 0, y: 0 });

  const formattedMessage = useMemo(() => formatText(line.message), [line.message]);

  const imageUrls = useMemo(() => {
    if (!inlineImages) return [];
    return line.message.match(IMAGE_RE) ?? [];
  }, [line.message, inlineImages]);

  const messageUrls = useMemo(() => {
    return line.message.match(URL_RE) ?? [];
  }, [line.message]);

  const cleanPrefix = showPrefixes && line.prefix ? stripColors(line.prefix) : '';
  const prefix = cleanPrefix ? (cleanPrefix.match(/^([~&@%+!])/) ?? [''])[0] : '';

  // Strip IRC formatting codes for plain text copy
  const plainText = useMemo(() => {
    // eslint-disable-next-line no-control-regex
    return line.message.replace(/[\x02\x03\x0f\x11\x16\x1a\x1b\x1c\x1d\x1e\x1f](\d{1,2}(,\d{1,2})?)?/g, '');
  }, [line.message]);

  const openContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y, text: plainText, urls: messageUrls });
  }, [plainText, messageUrls]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only intercept on desktop for custom menu
    if (isDesktop) {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY);
    }
  }, [isDesktop, openContextMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    longPressStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      openContextMenu(longPressStartPos.current.x, longPressStartPos.current.y);
    }, 500);
  }, [openContextMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressStartPos.current.x);
    const dy = Math.abs(touch.clientY - longPressStartPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const touchProps = {
    onContextMenu: handleContextMenu,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  // ── System messages ──
  if (line.isJoin || line.isPart || line.isQuit || line.isNick || line.isMode || line.isTopic) {
    return (
      <div className={`msg-row msg-system ${compact ? '' : 'msg-gap'}`} {...touchProps}>
        {timestamp && <span className="msg-ts">{timestamp}</span>}
        <span className="msg-body text-gray-500 sm:hover:text-gray-300 transition-colors text-[11px] sm:text-[12px]"
          dangerouslySetInnerHTML={{ __html: formattedMessage }} />
        {contextMenu && <MessageContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
      </div>
    );
  }

  // ── Action (/me) ──
  if (line.isAction) {
    return (
      <div className={`msg-row ${compact ? '' : 'py-0.5'} ${line.highlight ? 'msg-highlight' : ''}`} {...touchProps}>
        {timestamp && <span className={`msg-ts ${grouped ? 'invisible' : ''}`}>{timestamp}</span>}
        <span className="msg-nick-spacer" />
        <div className="msg-body text-gray-300 text-[14px] sm:text-[13px]">
          <strong style={nickStyle}>{nick}</strong>{' '}
          <span className="irc-msg-text" dangerouslySetInnerHTML={{ __html: formattedMessage }} />
        </div>
        {contextMenu && <MessageContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
      </div>
    );
  }

  // ── Notice ──
  if (line.isNotice) {
    return (
      <div className={`msg-row ${compact ? '' : 'py-0.5'}`} {...touchProps}>
        {timestamp && <span className="msg-ts">{timestamp}</span>}
        <span className="msg-nick-spacer" />
        <div className="msg-body">
          <span className="text-purple-400/80 text-[13px] font-medium">-{nick}-</span>{' '}
          <span className="text-purple-300/70 irc-msg-text text-[13px]" dangerouslySetInnerHTML={{ __html: formattedMessage }} />
        </div>
        {contextMenu && <MessageContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
      </div>
    );
  }

  // ── Regular message ──

  if (!isDesktop) {
    return (
      <div className={`${compact ? '' : grouped ? '' : 'mt-2.5'} ${line.highlight ? 'msg-highlight' : ''}`} {...touchProps}>
        {!grouped && (
          <div className="flex items-baseline gap-2 px-3 pt-1.5">
            <span className="font-semibold text-[13px] truncate max-w-[60%]" style={nickStyle}>
              {prefix}{nick}
            </span>
            {timestamp && (
              <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">{timestamp}</span>
            )}
          </div>
        )}
        <div className="px-3 pb-0.5">
          <span className={`irc-msg-text text-[14px] leading-[1.55] ${line.isSelf ? 'text-gray-400' : 'text-gray-200'}`}
            dangerouslySetInnerHTML={{ __html: formattedMessage }} />
          {imageUrls.map(url => (
            <img key={url} src={url} alt="" loading="lazy" className="irc-inline-image cursor-pointer"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} />
          ))}
        </div>
        {contextMenu && <MessageContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
      </div>
    );
  }

  return (
    <div className={`msg-row flex ${compact ? '' : grouped ? '' : 'msg-gap'} ${line.highlight ? 'msg-highlight' : ''}`} {...touchProps}>
      {timestamp && (
        <span className={`msg-ts ${grouped ? 'invisible' : ''}`}>{timestamp}</span>
      )}
      {!grouped ? (
        <span className="msg-nick" style={nickStyle}>{prefix}{nick}</span>
      ) : (
        <span className="msg-nick" />
      )}
      <div className="msg-body">
        <span className={`irc-msg-text text-[13px] ${line.isSelf ? 'text-gray-400' : 'text-gray-200'}`}
          dangerouslySetInnerHTML={{ __html: formattedMessage }} />
        {imageUrls.map(url => (
          <img key={url} src={url} alt="" loading="lazy" className="irc-inline-image cursor-pointer"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} />
        ))}
      </div>
      {contextMenu && <MessageContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}
