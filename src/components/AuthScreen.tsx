import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { cn } from '../lib/cn';
import { HAS_BUILT_IN_CONFIG } from '../lib/firebaseConfig';

export function AuthScreen() {
  const { signIn, signUp, connectCloud, loadCloudConfig, cloudReady } = useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ensureCloud = async () => {
    if (cloudReady) return true;
    const cfg = loadCloudConfig();
    if (!cfg) throw new Error('Firebase is not configured in this build.');
    const ok = await connectCloud(cfg);
    if (!ok) throw new Error('Failed to connect to Firebase');
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await ensureCloud();
      if (mode === 'signup') {
        if (!displayName.trim()) throw new Error('Enter your name');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        await signUp(email, password, displayName.trim());
      } else {
        await signIn(email, password);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-page">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-fg">Family Command Centre</h1>
          <p className="text-sm text-muted mt-1">
            {HAS_BUILT_IN_CONFIG
              ? 'Sign in with your email — same link works on every phone'
              : 'Each person signs in with their own email'}
          </p>
        </div>
        <Card className="space-y-4">
          <div className="flex gap-2 p-1 bg-surface rounded-xl">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={cn(
                'flex-1 py-2 text-sm rounded-lg font-medium transition-colors',
                mode === 'signin' ? 'bg-indigo-500 text-white' : 'text-muted hover:text-fg',
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={cn(
                'flex-1 py-2 text-sm rounded-lg font-medium transition-colors',
                mode === 'signup' ? 'bg-indigo-500 text-white' : 'text-muted hover:text-fg',
              )}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="text-xs text-muted mb-1 block">Your name</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted mb-1 block">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          {mode === 'signin' && (
            <p className="text-xs text-muted text-center">
              First time on this device? Use the same email you created on another phone, or Create account then join with an invite.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
