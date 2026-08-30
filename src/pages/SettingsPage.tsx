import { useEffect, useState } from 'react';
import { Bell, Lock, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { MEMBER_COLORS } from '../lib/defaults';
import { uid } from '../lib/uid';
import { cn } from '../lib/cn';
import type { Invite, Role } from '../types';
import { HAS_BUILT_IN_CONFIG } from '../lib/firebaseConfig';
import {
  getNotificationPermission,
  isNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
  showLocalNotification,
} from '../lib/notifications';

export function SettingsPage() {
  const {
    data,
    update,
    cloudReady,
    cloudError,
    familyId,
    syncStatus,
    authUser,
    leaveFamily,
    signOut,
    createInvite,
    listInvites,
    revokeInvite,
    parentPinUnlocked,
    unlockParentPin,
    lockParentPin,
  } = useApp();
  const [s, setS] = useState(data.settings);
  const [members, setMembers] = useState(data.members);
  const [newName, setNewName] = useState('');
  const [cloudMsg, setCloudMsg] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>('kid');
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [lastInvite, setLastInvite] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [newParentPin, setNewParentPin] = useState('');
  const [confirmParentPin, setConfirmParentPin] = useState('');
  const [notifOn, setNotifOn] = useState(isNotificationsEnabled);
  const [notifPerm, setNotifPerm] = useState(getNotificationPermission);
  const [notifBusy, setNotifBusy] = useState(false);

  const needsPin = !!(data.settings.parentPin && data.settings.parentPin.length >= 4);
  const unlocked = parentPinUnlocked || !needsPin;

  const refreshInvites = async () => {
    try {
      const list = await listInvites();
      setInvites(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (familyId && cloudReady && unlocked) void refreshInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, cloudReady, unlocked]);

  useEffect(() => {
    setS(data.settings);
    setMembers(data.members);
  }, [data.settings, data.members]);

  const save = () => {
    if (!unlocked) return;
    update((d) => ({ ...d, settings: s, members }));
    setCloudMsg('Settings saved.');
  };

  const addMember = () => {
    if (!newName.trim() || !unlocked) return;
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length]!;
    setMembers([
      ...members,
      {
        id: uid(),
        name: newName.trim(),
        color,
        initials: newName.trim().charAt(0).toUpperCase(),
        emoji: '👤',
        role: 'kid' as const,
      },
    ]);
    setNewName('');
  };

  const onCreateInvite = async () => {
    if (!unlocked) return;
    setInviteBusy(true);
    setCloudMsg('');
    try {
      const inv = await createInvite({ role: inviteRole, label: inviteLabel });
      setLastInvite(inv.code);
      setInviteLabel('');
      await refreshInvites();
      setCloudMsg('Invite created. Share the code once — it cannot be reused.');
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : 'Could not create invite');
    } finally {
      setInviteBusy(false);
    }
  };

  const applyParentPin = () => {
    if (newParentPin && newParentPin.length < 4) {
      setPinErr('PIN must be at least 4 digits');
      return;
    }
    if (newParentPin !== confirmParentPin) {
      setPinErr('PINs do not match');
      return;
    }
    setS({ ...s, parentPin: newParentPin || undefined });
    setNewParentPin('');
    setConfirmParentPin('');
    setPinErr('');
    setCloudMsg(newParentPin ? 'Parent PIN will apply after Save.' : 'Parent PIN will be cleared after Save.');
  };

  const statusColor: Record<string, string> = {
    local: 'text-muted',
    connecting: 'text-amber-400',
    live: 'text-emerald-400',
    error: 'text-red-400',
    auth: 'text-amber-400',
  };

  if (needsPin && !unlocked) {
    return (
      <div className="p-4 lg:p-6 max-w-sm mx-auto space-y-4">
        <h1 className="text-xl font-bold">Settings</h1>
        <Card className="space-y-4">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-500">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-semibold">Parent PIN required</h2>
            <p className="text-sm text-muted">Enter the parent PIN to manage family settings, invites, and roles.</p>
          </div>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••"
            className="text-center text-2xl tracking-[0.4em]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (!unlockParentPin(pinInput)) setPinErr('Wrong PIN');
                else setPinErr('');
              }
            }}
          />
          {pinErr && <p className="text-sm text-red-400 text-center">{pinErr}</p>}
          <Button
            className="w-full"
            onClick={() => {
              if (!unlockParentPin(pinInput)) setPinErr('Wrong PIN');
              else setPinErr('');
            }}
          >
            Unlock settings
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Settings</h1>
        {needsPin && (
          <Button size="sm" variant="ghost" onClick={lockParentPin}>
            <Lock className="w-4 h-4" /> Lock
          </Button>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Cloud Sync (secured)</h2>
          <span className={cn('text-xs font-medium uppercase tracking-wide', statusColor[syncStatus] || 'text-muted')}>
            {syncStatus === 'live'
              ? '● Live'
              : syncStatus === 'connecting'
                ? '● Connecting…'
                : syncStatus === 'error'
                  ? '● Error'
                  : syncStatus === 'auth'
                    ? '● Sign in required'
                    : '○ Local only'}
          </span>
        </div>
        <p className="text-xs text-muted mb-3">
          {HAS_BUILT_IN_CONFIG
            ? 'Cloud is built into this site. Everyone uses the same link — only sign-in or an invite is needed.'
            : 'Invite-only access. Each person signs in with their own email/password, then joins with a one-time invite.'}
        </p>
        {authUser && (
          <div className="mb-3 p-3 rounded-xl bg-input border border-border-strong">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm font-medium text-fg">{authUser.email}</p>
          </div>
        )}
        {familyId && (
          <div className="mb-3 p-3 rounded-xl bg-input border border-border-strong">
            <p className="text-xs text-muted mb-1">Internal family ID (not for sharing)</p>
            <p className="text-sm font-mono text-muted tracking-wider">{familyId}</p>
          </div>
        )}
        {(cloudError || cloudMsg) && (
          <p
            className={cn(
              'text-sm mb-3',
              cloudError || (cloudMsg && cloudMsg.toLowerCase().includes('fail')) ? 'text-red-400' : 'text-emerald-400',
            )}
          >
            {cloudError || cloudMsg}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-2">
          {authUser && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                setCloudMsg('Signed out.');
              }}
            >
              Sign out
            </Button>
          )}
          {cloudReady && familyId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await leaveFamily();
                setCloudMsg('Left family.');
              }}
            >
              Leave family
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notifications
        </h2>
        <p className="text-xs text-muted mb-3">
          Alerts on this device for new messages, due/high-priority to-dos, upcoming events (next hour), and
          announcement changes. Works while the site is open or in a background tab — not when the browser is fully
          closed (that needs cloud push later).
        </p>
        <p className="text-xs text-muted mb-3">
          Browser permission:{' '}
          <span className="font-medium text-fg">
            {notifPerm === 'unsupported' ? 'not supported' : notifPerm}
          </span>
          {notifOn ? ' · enabled for this device' : ' · off on this device'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={notifBusy || notifPerm === 'unsupported'}
            onClick={async () => {
              setNotifBusy(true);
              try {
                let perm = getNotificationPermission();
                if (perm === 'default') {
                  perm = await requestNotificationPermission();
                  setNotifPerm(perm);
                }
                if (perm !== 'granted') {
                  setCloudMsg('Notification permission was denied. Enable it in browser site settings.');
                  return;
                }
                setNotificationsEnabled(true);
                setNotifOn(true);
                window.dispatchEvent(new Event('fcc:notif-pref'));
                await showLocalNotification('Notifications on', {
                  body: 'You’ll get alerts for messages, to-dos, and events on this device.',
                  tag: 'fcc-test',
                  data: { view: 'dashboard' },
                });
                setCloudMsg('Notifications enabled for this device.');
              } finally {
                setNotifBusy(false);
              }
            }}
          >
            {notifOn ? 'Send test alert' : 'Enable notifications'}
          </Button>
          {notifOn && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNotificationsEnabled(false);
                setNotifOn(false);
                window.dispatchEvent(new Event('fcc:notif-pref'));
                setCloudMsg('Notifications disabled on this device.');
              }}
            >
              Disable
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Parent PIN</h2>
        <p className="text-xs text-muted mb-3">
          Required to open Settings (invites, roles, leave family). Protects a logged-in parent phone from casual
          tampering. Server rules still block kids from writing these fields.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newParentPin}
            onChange={(e) => setNewParentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={s.parentPin ? 'New PIN (or blank to clear)' : 'Set 4–6 digit PIN'}
          />
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmParentPin}
            onChange={(e) => setConfirmParentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Confirm PIN"
          />
        </div>
        {pinErr && <p className="text-sm text-red-400 mt-2">{pinErr}</p>}
        <Button size="sm" className="mt-3" variant="secondary" onClick={applyParentPin}>
          {newParentPin ? 'Set parent PIN' : 'Clear parent PIN'}
        </Button>
        {s.parentPin && <p className="text-xs text-emerald-500 mt-2">Parent PIN is set (remember to Save).</p>}
      </Card>

      {familyId && cloudReady && (
        <Card>
          <h2 className="font-semibold mb-1">Invites (invite-only)</h2>
          <p className="text-xs text-muted mb-3">One-time codes. Only parents can create or revoke (enforced in rules).</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <Input
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              placeholder="Optional label"
              className="flex-1 min-w-[120px]"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="bg-surface-2 border border-border-strong rounded-xl px-3 py-2 text-sm"
            >
              <option value="kid">Kid</option>
              <option value="parent">Parent</option>
              <option value="media">Media only</option>
            </select>
            <Button size="sm" onClick={onCreateInvite} disabled={inviteBusy}>
              {inviteBusy ? '…' : 'Create invite'}
            </Button>
          </div>
          {lastInvite && (
            <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
              <p className="text-xs text-muted mb-1">Share once</p>
              <p className="text-xl font-bold tracking-widest text-indigo-500">{lastInvite}</p>
            </div>
          )}
          {invites.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {invites.map((inv) => (
                <div
                  key={inv.code}
                  className="flex items-center gap-2 text-xs p-2 rounded-lg bg-surface/60 border border-border"
                >
                  <span
                    className={cn('font-mono tracking-wider', inv.used ? 'text-faint line-through' : 'text-indigo-500')}
                  >
                    {inv.code}
                  </span>
                  <span className="text-muted">{inv.role}</span>
                  {inv.label && <span className="text-muted">{inv.label}</span>}
                  <span className="ml-auto text-faint">{inv.used ? 'Used' : 'Open'}</span>
                  {!inv.used && (
                    <button
                      type="button"
                      onClick={() => void revokeInvite(inv.code).then(refreshInvites)}
                      className="text-red-400 px-1"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="font-semibold mb-3">Family</h2>
        <label className="text-xs text-muted mb-1 block">Family name</label>
        <Input value={s.familyName} onChange={(e) => setS({ ...s, familyName: e.target.value })} className="mb-4" />
        <label className="text-xs text-muted mb-1 block">Pinned announcement</label>
        <Input
          value={s.pinnedAnnouncement || ''}
          onChange={(e) => setS({ ...s, pinnedAnnouncement: e.target.value })}
        />
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Family Members</h2>
        <p className="text-xs text-muted mb-3">
          Kid PIN locks that profile after sign-in until the PIN is entered. Roles are enforced server-side — kids
          cannot promote themselves.
        </p>
        <div className="space-y-3 mb-3">
          {members.map((m, i) => (
            <div key={m.id} className="flex flex-col gap-2 p-2 rounded-xl bg-inset border border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <Avatar {...m} size="sm" />
                <Input
                  value={m.name}
                  onChange={(e) => {
                    const n = [...members];
                    n[i] = { ...m, name: e.target.value, initials: e.target.value.charAt(0).toUpperCase() };
                    setMembers(n);
                  }}
                  className="flex-1 min-w-[100px]"
                />
                <select
                  value={m.role || 'kid'}
                  onChange={(e) => {
                    const n = [...members];
                    n[i] = { ...m, role: e.target.value as Role };
                    setMembers(n);
                  }}
                  className="bg-surface-2 border border-border-strong rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="parent">Parent</option>
                  <option value="kid">Kid</option>
                  <option value="media">Media only</option>
                </select>
                <input
                  type="color"
                  value={m.color}
                  onChange={(e) => {
                    const n = [...members];
                    n[i] = { ...m, color: e.target.value };
                    setMembers(n);
                  }}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMembers(members.filter((x) => x.id !== m.id))}
                    className="p-1.5 text-muted hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {m.role === 'kid' && (
                <div className="flex items-center gap-2 pl-1">
                  <Lock className="w-3.5 h-3.5 text-muted shrink-0" />
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={m.pin || ''}
                    onChange={(e) => {
                      const n = [...members];
                      const pin = e.target.value.replace(/\D/g, '').slice(0, 6);
                      n[i] = { ...m, pin: pin || undefined };
                      setMembers(n);
                    }}
                    placeholder="Kid PIN (optional)"
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Local profile name"
            onKeyDown={(e) => e.key === 'Enter' && addMember()}
          />
          <Button size="sm" onClick={addMember}>
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Media Servers</h2>
        <label className="text-xs text-muted mb-1 block">Emby URL</label>
        <Input value={s.embyUrl} onChange={(e) => setS({ ...s, embyUrl: e.target.value })} className="mb-3" />
        <label className="text-xs text-muted mb-1 block">Komga URL</label>
        <Input value={s.komgaUrl} onChange={(e) => setS({ ...s, komgaUrl: e.target.value })} />
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Theme</h2>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setS({ ...s, theme: t })}
              className={cn(
                'px-4 py-2 rounded-xl text-sm capitalize',
                s.theme === t ? 'bg-indigo-500 text-white' : 'bg-surface-2 text-muted',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      <Button onClick={save} className="w-full">
        Save Settings
      </Button>
      <p className="text-xs text-muted text-center">
        {familyId ? 'Data syncs live to all devices in this family.' : 'Local-only until cloud is connected.'}
      </p>
    </div>
  );
}
