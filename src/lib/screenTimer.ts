/** Non-Emby screen timer helpers (Nintendo, web, TV, etc.). */

export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new Ctx();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Call from a user gesture (e.g. Start timer) so the browser allows sound later
 * when the countdown hits zero without another tap.
 */
export async function unlockTimerAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    // Silent blip to fully unlock on iOS
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

/**
 * Clear, repeating kitchen-timer style alarm (~5s).
 * Louder than before but not a single harsh spike; pattern is hard to miss.
 */
export function playTimeUpBeep(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  } catch {
    /* ignore */
  }

  const ctx = getCtx();
  if (!ctx) return;

  void (async () => {
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      /* may still fail without prior unlock */
    }

    const t0 = ctx.currentTime + 0.02;
    // Three rounds: high-high-low, pause, repeat
    const pattern: { at: number; freq: number; dur: number }[] = [];
    let t = 0;
    for (let round = 0; round < 3; round++) {
      pattern.push({ at: t, freq: 1046, dur: 0.22 }); // C6
      t += 0.28;
      pattern.push({ at: t, freq: 1046, dur: 0.22 });
      t += 0.28;
      pattern.push({ at: t, freq: 784, dur: 0.45 }); // G5
      t += 0.7;
    }

    for (const p of pattern) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = p.freq;
      const start = t0 + p.at;
      const peak = 0.35; // moderate — audible without clipping laptop speakers
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.03);
      g.gain.setValueAtTime(peak, start + p.dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, start + p.dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(start);
      o.stop(start + p.dur + 0.02);
    }
  })();
}

const ALERT_SEEN_KEY = 'fcc_screentimer_alerts_seen';

export function wasScreenTimerAlertSeen(id: string): boolean {
  try {
    const raw = localStorage.getItem(ALERT_SEEN_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return arr.includes(id);
  } catch {
    return false;
  }
}

export function markScreenTimerAlertSeen(id: string): void {
  try {
    const raw = localStorage.getItem(ALERT_SEEN_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(id)) arr.push(id);
    localStorage.setItem(ALERT_SEEN_KEY, JSON.stringify(arr.slice(-40)));
  } catch {
    /* ignore */
  }
}
