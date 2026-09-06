/** Non-Emby screen timer helpers (Nintendo, web, TV, etc.). */

export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Alarm-style beep (Web Audio). Safe to call from user gesture or timer end. */
export function playTimeUpBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const beep = (t0: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.4);
    };
    beep(now, 880);
    beep(now + 0.45, 880);
    beep(now + 0.9, 660);
    window.setTimeout(() => void ctx.close(), 2000);
  } catch {
    /* ignore */
  }
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
