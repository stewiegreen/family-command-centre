import { useState } from 'react';
import { Lightbulb, LightbulbOff, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { getFirebaseAuth } from '../lib/firebase';
import { cn } from '../lib/cn';

type Busy = 'on' | 'off' | null;

async function postLights(action: 'on' | 'off'): Promise<void> {
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
    body: JSON.stringify({ action }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Lights ${action} failed (${res.status})`);
  }
}

/** Parents-only living-room lights: one On / one Off for both bulbs. */
export function LightsCard() {
  const [busy, setBusy] = useState<Busy>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<'on' | 'off' | null>(null);

  const run = async (action: 'on' | 'off') => {
    if (busy) return;
    setBusy(action);
    setErr(null);
    try {
      await postLights(action);
      setLast(action);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="!p-4 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold text-fg">Living room lights</h2>
      </div>
      <p className="text-[11px] text-muted">
        Turns both Genio lights on or off. Parents only.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-auto">
        <Button
          className={cn(
            'h-14 text-base font-semibold',
            last === 'on' && !busy && 'ring-2 ring-amber-400/60',
          )}
          disabled={!!busy}
          onClick={() => run('on')}
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
            'h-14 text-base font-semibold',
            last === 'off' && !busy && 'ring-2 ring-border-strong',
          )}
          disabled={!!busy}
          onClick={() => run('off')}
        >
          {busy === 'off' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <LightbulbOff className="w-5 h-5" />
          )}
          Off
        </Button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </Card>
  );
}
