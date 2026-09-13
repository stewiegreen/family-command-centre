import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { changeSignInEmail } from '../lib/firebase';

/**
 * TEMPORARY — remove after family emails are migrated to @greenhq.io
 * Open while signed in: https://greenhq.io/#change-email
 */
export function ChangeEmailPage() {
  const { authUser, currentUser } = useApp();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setErr('');
    const next = newEmail.trim().toLowerCase();
    if (!next || !next.includes('@')) {
      setErr('Enter a valid new email address.');
      return;
    }
    if (!password) {
      setErr('Enter the current password to confirm.');
      return;
    }
    if (authUser?.email && next === authUser.email.toLowerCase()) {
      setErr('That is already the current sign-in email.');
      return;
    }
    setBusy(true);
    try {
      await changeSignInEmail(next, password);
      setDone(true);
      setPassword('');
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      const msg = e instanceof Error ? e.message : String(e);
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErr('Wrong password. Use the password for this GreenHQ account.');
      } else if (code === 'auth/email-already-in-use') {
        setErr('That email is already used by another Firebase account.');
      } else if (code === 'auth/requires-recent-login') {
        setErr('Session too old — sign out, sign back in, then try again.');
      } else {
        setErr(msg || 'Could not start email change.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-page text-fg flex items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-4 !p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">
            Temporary tool — remove after migration
          </p>
          <h1 className="text-xl font-semibold text-fg mt-1">Change sign-in email</h1>
          <p className="text-sm text-muted mt-1">
            Same account and family data. Only the login address changes.
          </p>
        </div>

        <div className="rounded-xl bg-inset border border-border p-3 text-sm space-y-1">
          <p className="text-muted text-xs">Signed in as</p>
          <p className="font-medium text-fg break-all">{authUser?.email || '—'}</p>
          {currentUser && (
            <p className="text-xs text-muted">
              Profile: {currentUser.name} ({currentUser.role})
            </p>
          )}
        </div>

        {done ? (
          <div className="space-y-3 text-sm">
            <p className="text-fg font-medium">Check the new inbox</p>
            <p className="text-muted">
              Firebase sent a confirmation link to{' '}
              <span className="text-fg font-medium break-all">{newEmail.trim()}</span>. Open that
              link on this device (or any device), then sign in with the new email and the same
              password.
            </p>
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                window.location.hash = '';
                window.location.reload();
              }}
            >
              Back to GreenHQ
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted">New email</label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="ellis@greenhq.io"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Current password</label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
            <Button className="w-full" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Sending…' : 'Send confirmation to new email'}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted hover:text-fg underline"
              onClick={() => {
                window.location.hash = '';
                window.location.reload();
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
