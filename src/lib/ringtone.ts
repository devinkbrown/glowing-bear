let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

function getCtx(): AudioContext | null {
  try {
    // iOS Safari: AudioContext must be created from a user gesture the first
    // time, and resume() is a no-op unless called within one. We lazily
    // create here and rely on the unlock below for iOS.
    if (!audioCtx || audioCtx.state === 'closed') {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch { return null; }
}

// iOS Safari: the very first AudioContext.resume() must happen inside a
// user-initiated event handler. We register a one-shot touch/click listener
// that unlocks audio so that programmatic playback (ringtone on incoming
// call) works even without a direct user tap at that moment.
function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'running') return;
  ctx.resume().then(() => {
    // Play a silent buffer to fully unlock on iOS
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }).catch(() => {});
}

if (typeof document !== 'undefined') {
  const events = ['touchstart', 'touchend', 'click', 'keydown'] as const;
  const onUnlock = () => {
    unlockAudio();
    for (const ev of events) document.removeEventListener(ev, onUnlock, true);
  };
  for (const ev of events) document.addEventListener(ev, onUnlock, { capture: true, once: false, passive: true });
}

function burst(ctx: AudioContext, frequencies: number[], duration: number, volume: number) {
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime + duration * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  for (const freq of frequencies) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    const entry = { osc, gain };
    activeNodes.push(entry);
    osc.onended = () => {
      activeNodes = activeNodes.filter(n => n !== entry);
    };
  }
}

export function startIncomingRing() {
  stopRing();
  const ctx = getCtx();
  if (!ctx) return;
  const ring = () => burst(ctx, [440, 480], 0.8, 0.12);
  ring();
  ringTimer = setInterval(ring, 3000);
}

export function startOutgoingRing() {
  stopRing();
  const ctx = getCtx();
  if (!ctx) return;
  const ring = () => burst(ctx, [440], 1.5, 0.06);
  ring();
  ringTimer = setInterval(ring, 5000);
}

export function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  for (const { osc } of activeNodes) {
    try { osc.stop(); } catch { /* already stopped */ }
  }
  activeNodes = [];
}
