'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/stores';
import GifPicker from './GifPicker';
import { bufferKind } from '@/lib/bufferKind';

function inputPlaceholder(entry?: { buffer: import('@/types').WeeChatBuffer }): string {
  if (!entry) return '';
  const kind = bufferKind(entry.buffer);
  switch (kind) {
    case 'raw': return 'Raw log (read-only)';
    case 'fset': return '/fset filter or command...';
    case 'core': return 'WeeChat command...';
    case 'plugin': return 'Command...';
    default: return 'Message...';
  }
}

export default function InputBar() {
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const sendInput = useStore(s => s.sendInput);
  const complete = useStore(s => s.complete);
  const cycleCompletion = useStore(s => s.cycleCompletion);
  const resetCompletion = useStore(s => s.resetCompletion);
  const completionActive = useStore(s => s.completionActive);
  const uploadUrl = useStore(s => s.settings.uploadUrl);
  const tenorApiKey = useStore(s => s.settings.tenorApiKey);

  const [text, setText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showGif, setShowGif] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pastePreview, setPastePreview] = useState<{ file: File; dataUrl: string } | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drafts = useRef<Map<string, string>>(new Map());
  const lastSubmitTime = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;

  // Persist drafts across buffer switches
  useEffect(() => {
    if (!activeBuffer) return;
    return () => {
      if (activeBuffer && textRef.current) drafts.current.set(activeBuffer, textRef.current);
    };
  }, [activeBuffer]);

  useEffect(() => {
    if (activeBuffer) {
      const draft = drafts.current.get(activeBuffer) ?? '';
      setText(draft);
      drafts.current.delete(activeBuffer);
      inputRef.current?.focus();
    }
  }, [activeBuffer]);

  // Auto-resize textarea — smooth, no flash
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0';
    const next = Math.min(Math.max(el.scrollHeight, 44), 160);
    el.style.height = `${next}px`;
  }, [text]);

  // On focus, ensure the input area is visible above the iOS keyboard
  const handleFocus = useCallback(() => {
    setFocused(true);
    setTimeout(() => {
      wrapperRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 300);
    setTimeout(() => {
      wrapperRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 600);
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!uploadUrl) { setUploadError('No upload URL configured — set one in Settings'); return null; }
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) { setUploadError(`Upload failed (${res.status})`); return null; }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('json')) {
        const data = await res.json();
        return data.url ?? data.link ?? data.file ?? data.path ?? null;
      }
      const url = (await res.text()).trim();
      return url.startsWith('http') ? url : null;
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : 'network error'}`);
      return null;
    } finally {
      setUploading(false);
    }
  }, [uploadUrl]);

  const handleFileUpload = useCallback(async (file: File) => {
    const url = await uploadFile(file);
    if (url && activeBuffer) {
      sendInput(url);
    } else if (!url && !uploadError) {
      setUploadError('Upload returned no URL');
    }
  }, [uploadFile, activeBuffer, sendInput, uploadError]);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !activeBuffer) return;
    const now = Date.now();
    if (now - lastSubmitTime.current < 300) return;
    lastSubmitTime.current = now;
    sendInput(trimmed);
    setHistory(prev => [trimmed, ...prev].slice(0, 100));
    setHistoryIdx(-1);
    setText('');
    resetCompletion();
  }, [text, activeBuffer, sendInput, resetCompletion]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPastePreview({ file, dataUrl: reader.result as string });
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const confirmPasteUpload = useCallback(async () => {
    if (!pastePreview) return;
    await handleFileUpload(pastePreview.file);
    setPastePreview(null);
  }, [pastePreview, handleFileUpload]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (completionActive) {
        const result = cycleCompletion(!e.shiftKey);
        if (result) setText(result);
      } else {
        const el = inputRef.current;
        if (el) {
          const result = complete(text, el.selectionStart, activeBuffer);
          if (result !== text) setText(result);
        }
      }
      return;
    }
    if (completionActive && e.key !== 'Shift') resetCompletion();
    if (e.key === 'ArrowUp' && !text.includes('\n')) {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(newIdx);
        setText(history[newIdx]);
      }
      return;
    }
    if (e.key === 'ArrowDown' && !text.includes('\n')) {
      e.preventDefault();
      if (historyIdx > 0) { setHistoryIdx(historyIdx - 1); setText(history[historyIdx - 1]); }
      else { setHistoryIdx(-1); setText(''); }
      return;
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      const el = inputRef.current;
      if (!el) return;
      let code = '';
      switch (e.key.toLowerCase()) {
        case 'b': code = '\x02'; break;
        case 'i': code = '\x1d'; break;
        case 'u': code = '\x1f'; break;
      }
      if (code) {
        e.preventDefault();
        const s = el.selectionStart, end = el.selectionEnd;
        if (s !== end) setText(`${text.slice(0, s)}${code}${text.slice(s, end)}${code}${text.slice(end)}`);
        else setText(text.slice(0, s) + code + text.slice(s));
      }
    }
  }, [text, submit, complete, cycleCompletion, resetCompletion, completionActive, activeBuffer, history, historyIdx]);

  const hasText = text.trim().length > 0;

  return (
    <div ref={wrapperRef} className="shrink-0 relative input-bar-wrapper border-t border-white/[0.05]"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      {/* Paste preview */}
      {pastePreview && (
        <div className="absolute bottom-full left-2 right-2 sm:left-3 sm:right-3 mb-1 bg-gray-900 border border-white/[0.06] rounded-xl p-3 shadow-xl animate-slide-down">
          <div className="flex items-start gap-3">
            <img src={pastePreview.dataUrl} alt="Paste preview"
              className="max-h-[80px] sm:max-h-[120px] max-w-[140px] sm:max-w-[200px] rounded-lg border border-white/[0.06]" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-300 mb-1">Upload pasted image?</p>
              <p className="text-[11px] text-gray-500 mb-2 sm:mb-3 truncate">{pastePreview.file.name} ({(pastePreview.file.size / 1024).toFixed(0)} KB)</p>
              <div className="flex gap-2">
                <button onClick={confirmPasteUpload} disabled={uploading}
                  className="px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-[12px] sm:text-[11px] font-medium bg-[var(--custom-accent,#818cf8)] text-white hover:opacity-85 active:opacity-70 disabled:opacity-40 transition-all">
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button onClick={() => setPastePreview(null)}
                  className="px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-[12px] sm:text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload error toast */}
      {uploadError && (
        <div className="absolute bottom-full left-2 right-2 sm:left-3 sm:right-3 mb-1 bg-red-900/80 border border-red-500/20 rounded-xl px-3 py-2 shadow-xl animate-slide-down flex items-center gap-2">
          <span className="text-[12px] text-red-200 flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-red-200 shrink-0 text-[11px] font-medium">Dismiss</button>
        </div>
      )}

      {/* GIF picker */}
      {showGif && (
        <GifPicker
          apiKey={tenorApiKey}
          onSelect={(url) => { if (activeBuffer) sendInput(url); }}
          onClose={() => setShowGif(false)}
        />
      )}

      {/* Input row */}
      <div className="px-2 sm:px-3 pt-2 pb-1.5">
        <div className={`flex items-end gap-1.5 rounded-2xl sm:rounded-xl transition-all duration-200
          ${focused ? 'bg-white/[0.04] ring-1 ring-[var(--custom-accent,#818cf8)]/20' : 'bg-white/[0.02]'}
          border ${focused ? 'border-[var(--custom-accent,#818cf8)]/30' : 'border-white/[0.06]'}
          px-2 sm:px-3 py-1.5`}>

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={activeBuffer ? inputPlaceholder(buffers.get(activeBuffer)) : ''}
            disabled={!activeBuffer}
            rows={1}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            className="flex-1 bg-transparent text-[15px] sm:text-[14px] text-gray-200 py-2 outline-none
              resize-none placeholder:text-gray-500 disabled:opacity-20 leading-[1.45]"
            style={{ minHeight: '44px', maxHeight: '160px' }}
          />

          {/* Action buttons — inside the input container */}
          <div className="flex items-center gap-0.5 pb-1.5 shrink-0">
            {/* Upload */}
            <button onClick={() => fileRef.current?.click()} disabled={!activeBuffer || !uploadUrl}
              className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300
                active:bg-white/[0.08] transition-colors disabled:opacity-20 disabled:cursor-default"
              title={uploadUrl ? 'Upload file' : 'Set upload URL in Settings'}
              aria-label="Upload file">
              <svg className="w-[17px] h-[17px] sm:w-[15px] sm:h-[15px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5V10" />
                <path d="M8 2v8M5 5l3-3 3 3" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />

            {/* GIF */}
            <button onClick={() => setShowGif(!showGif)} disabled={!activeBuffer}
              className={`w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors
                ${showGif ? 'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/10' : 'text-gray-500 hover:text-gray-300 active:bg-white/[0.08]'}
                disabled:opacity-20 disabled:cursor-default`}
              title="GIF"
              aria-label="GIF picker">
              <span className="text-[11px] sm:text-[10px] font-bold tracking-tight">GIF</span>
            </button>

            {/* Send / uploading */}
            {uploading ? (
              <div className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center">
                <span className="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
              </div>
            ) : (
              <button onClick={submit} disabled={!hasText || !activeBuffer}
                className={`w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl sm:rounded-lg transition-all duration-150
                  ${hasText
                    ? 'bg-[var(--custom-accent,#818cf8)] text-white hover:opacity-85 active:scale-90 shadow-sm shadow-black/30'
                    : 'bg-transparent text-gray-700 cursor-default'
                  }`}
                aria-label="Send">
                <svg className="w-[17px] h-[17px] sm:w-[15px] sm:h-[15px]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.7 1.4a.8.8 0 0 1 .9-.1l11.5 6a.8.8 0 0 1 0 1.4l-11.5 6a.8.8 0 0 1-1.1-.9L3.1 9H7a.8.8 0 0 0 0-1.6H3.1L1.5 2.3a.8.8 0 0 1 .2-.9z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
