import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

/** Full-screen gate when a kid profile has a PIN set. */
export function KidPinGate({ children }: { children: React.ReactNode }) {
  const { kidPinRequired, kidPinUnlocked, unlockKidPin, currentUser, signOut } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  if (!kidPinRequired || kidPinUnlocked) return <>{children}</>;

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-page">
      <Card className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-500">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-fg">Enter PIN</h1>
          <p className="text-sm text-muted">
            {currentUser?.name ? `${currentUser.name}'s profile is locked` : 'This profile is locked'}
          </p>
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (!unlockKidPin(pin)) setErr('Wrong PIN');
              else setErr('');
            }
          }}
        />
        {err && <p className="text-sm text-red-400 text-center">{err}</p>}
        <Button
          className="w-full"
          onClick={() => {
            if (!unlockKidPin(pin)) setErr('Wrong PIN');
            else setErr('');
          }}
        >
          Unlock
        </Button>
        <button
          type="button"
          className="w-full text-xs text-muted hover:text-indigo-500 underline"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}
