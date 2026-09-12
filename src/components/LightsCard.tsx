import { useEffect, useRef, useState } from 'react';
import { Lightbulb, LightbulbOff, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { getFirebaseAuth } from '../lib/firebase';
import { cn } from '../lib/cn';

type Busy = 'on' | 'off' | 'dim' | null;

const BRIGHTNESS_KEY = 'fcc_lights_brightness';

async function postLights(
  body: { action: 'on' | 'off' } | { action: 'dim'; percent: number },
): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  const res = await fetch('/api/lights/control', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Lights request failed (${res.status})`);
  }
}

function loadBrightness(): number {
  try {
    const n = Number(localStorage.getItem(BRIGHTNESS_KEY));
    if (Number.isFinite(n) && n >= 1 && n <= 100) return Math.round(n);
  } catch {
    /* ignore */
  }
  return 70;
}

/** Parents-only living-room lights: On / Off + shared dimmer for both bulbs. */
export function LightsCard() {
  const [busy, setBusy] = useState<Busy>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<'on' | 'off' | null>(null);
  const [brightness, setBrightness] = useState(loadBrightness);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;

  useEffect(() => {
    return () => {
      if (dimTimer.current) clearTimeout(dimTimer.current);
    };
  }, []);

  const runPower = async (action: 'on' | 'off') => {
    if (busy) return;
    setBusy(action);
    setErr(null);
    try {
      await postLights({ action });
      setLast(action);
      if (action === 'on') {
        // Apply current slider level after power-on so both match the dimmer
        try {
          await postLights({ action: 'dim', percent: brightnessRef.current });
        } catch {
          /* on succeeded; dim is best-effort */
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const commitDim = async (percent: number) => {
    const pct = Math.max(1, Math.min(100, Math.round(percent)));
    try {
      localStorage.setItem(BRIGHTNESS_KEY, String(pct));
    } catch {
      /* ignore */
    }
    setBusy('dim');
    setErr(null);
    try {
      await postLights({ action: 'dim', percent: pct });
      setLast('on');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSliderChange = (value: number) => {
    setBrightness(value);
    if (dimTimer.current) clearTimeout(dimTimer.current);
    // Debounce while dragging so Tuya is not flooded
    dimTimer.current = setTimeout(() => {
      void commitDim(value);
    }, 280);
  };

  const onSliderCommit = (value: number) => {
    if (dimTimer.current) {
      clearTimeout(dimTimer.current);
      dimTimer.current = null;
    }
    void commitDim(value);
  };

  return (
    <Card className="!p-4 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold text-fg">Living room lights</h2>
      </div>
      <p className="text-[11px] text-muted">
        Both Genio lights · parents only
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          className={cn(
            'h-12 text-base font-semibold',
            last === 'on' && !busy && 'ring-2 ring-amber-400/60',
          )}
          disabled={!!busy}
          onClick={() => runPower('on')}
        >
          {busy === 'on' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Lightbulb className="w-5 h-5" />
          )}
          On
        </Button>
        <Button
          variant="secondary"
          className={cn(
            'h-12 text-base font-semibold',
            last === 'off' && !busy && 'ring-2 ring-border-strong',
          )}
          disabled={!!busy}
          onClick={() => runPower('off')}
        >
          {busy === 'off' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <LightbulbOff className="w-5 h-5" />
          )}
          Off
        </Button>
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="lights-dim" className="text-xs font-medium text-muted">
            Brightness
          </label>
          <span className="text-xs tabular-nums text-fg font-semibold flex items-center gap-1">
            {busy === 'dim' && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
            {brightness}%
          </span>
        </div>
        <input
          id="lights-dim"
          type="range"
          min={1}
          max={100}
          step={1}
          value={brightness}
          disabled={!!busy && busy !== 'dim'}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          onMouseUp={(e) => onSliderCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) =>
            onSliderCommit(Number((e.target as HTMLInputElement).value))
          }
          className="w-full accent-amber-500 h-2 cursor-pointer disabled:opacity-50"
        />
        <div className="flex justify-between text-[10px] text-faint">
          <span>Dim</span>
          <span>Bright</span>
        </div>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}
    </Card>
  );
}
