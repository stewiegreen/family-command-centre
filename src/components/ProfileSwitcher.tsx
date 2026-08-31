import { useState } from 'react';
import { Check, Lock, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { cn } from '../lib/cn';
import type { ThemeId } from '../types';

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'neon', label: 'Neon' },
];

export function ProfileSwitcher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, currentUser, getMember, switchProfile, setMyTheme } = useApp();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  const myTheme =
    (currentUser && data.appearance?.[currentUser.id]?.theme) || data.settings.theme || 'dark';

  const needsPinFor = (memberId: string) => {
    const m = data.members.find((x) => x.id === memberId);
    if (!m) return false;
    if (m.pin && m.pin.length >= 4) return true;
    if (m.role === 'parent' && data.settings.parentPin) return true;
    return false;
  };

  const pick = (memberId: string) => {
    setErr('');
    if (memberId === currentUser?.id) {
      onClose();
      return;
    }
    if (needsPinFor(memberId)) {
      setPendingId(memberId);
      setPin('');
      return;
    }
    const res = switchProfile(memberId);
    if (!res.ok) setErr(res.error || 'Could not switch');
    else onClose();
  };

  const confirmPin = () => {
    if (!pendingId) return;
    const res = switchProfile(pendingId, pin);
    if (!res.ok) {
      setErr(res.error || 'Wrong PIN');
      return;
    }
    setPendingId(null);
    setPin('');
    setErr('');
    onClose();
  };

  const pending = pendingId ? data.members.find((m) => m.id === pendingId) : null;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPendingId(null);
        setPin('');
        setErr('');
        onClose();
      }}
      title="Who's using this device?"
    >
      <div className="space-y-4">
        {pending ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border">
              <Avatar {...(getMember(pending.id) || pending)} size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-fg truncate">{pending.name}</p>
                <p className="text-xs text-muted flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Enter PIN to switch
                </p>
              </div>
            </div>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              className="text-center text-2xl tracking-[0.4em]"
              onKeyDown={(e) => e.key === 'Enter' && confirmPin()}
              autoFocus
            />
            {err && <p className="text-sm text-red-400 text-center">{err}</p>}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setPendingId(null);
                  setPin('');
                  setErr('');
                }}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={confirmPin}>
                Switch
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.members
                .filter((m) => m.role !== 'media')
                .map((m) => {
                  const display = getMember(m.id) || m;
                  const active = m.id === currentUser?.id;
                  const locked = needsPinFor(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pick(m.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors text-center',
                        active
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-surface-2 hover:bg-surface-3 text-fg',
                      )}
                    >
                      <div className="relative">
                        <Avatar {...display} size="md" />
                        {locked && (
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center">
                            <Lock className="w-3 h-3 text-muted" />
                          </span>
                        )}
                        {active && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent text-accent-ink flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium truncate w-full">{m.name}</span>
                    </button>
                  );
                })}
            </div>
            {err && <p className="text-sm text-red-400 text-center">{err}</p>}

            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                My theme
              </p>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMyTheme(t.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-sm capitalize',
                      myTheme === t.id
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface-2 text-muted hover:bg-surface-3',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-faint mt-2">
                Applies on this profile only. Family default stays in Settings.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
