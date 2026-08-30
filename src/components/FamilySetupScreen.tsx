import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

/**
 * Invite-only onboarding. Creating a new family is disabled so there is only
 * one family document and local seed data cannot leak into a second cloud family.
 */
export function FamilySetupScreen() {
  const { joinFamily, signOut, authUser } = useApp();
  const [name, setName] = useState(authUser?.displayName || '');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await joinFamily(inviteCode, name.trim() || authUser?.displayName || 'Member');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not join family');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-page">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold text-fg">Join your family</h1>
          <p className="text-sm text-muted mt-1">Signed in as {authUser?.email}</p>
        </div>
        <Card className="space-y-4">
          <form onSubmit={onJoin} className="space-y-3">
            <p className="text-xs text-muted">
              This app is invite-only. Ask a parent for a one-time invite code from Settings.
            </p>
            <div>
              <label className="text-xs text-muted mb-1 block">Your display name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" required />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Invite code</label>
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7MP2Q9X"
                className="uppercase tracking-widest"
                required
              />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy || !inviteCode.trim()}>
              {busy ? 'Joining…' : 'Join with invite'}
            </Button>
          </form>
        </Card>
        <p className="text-center text-xs text-faint">
          <button type="button" className="text-muted hover:text-accent underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
