import { useEffect, useState } from 'react';
import { Bell, Lock, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { geocodeCity, saveStoredLocation } from '../lib/weather';
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
    getMember,
    isParent,
  } = useApp();
  const [s, setS] = useState(data.settings);
  const [members, setMembers] = useState(data.members);
  const [newName, setNewName] = useState('');
  const [weatherCityDraft, setWeatherCityDraft] = useState(data.settings.weather?.label || '');
  const [weatherLocMsg, setWeatherLocMsg] = useState<string | null>(null);
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
            <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center text-accent">
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
        {s.parentPin && <p className="text-xs text-accent mt-2">Parent PIN is set (remember to Save).</p>}
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
            <div className="mb-3 p-3 rounded-xl bg-accent/10 border border-accent/30">
              <p className="text-xs text-muted mb-1">Share once</p>
              <p className="text-xl font-bold tracking-widest text-accent">{lastInvite}</p>
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
                    className={cn('font-mono tracking-wider', inv.used ? 'text-faint line-through' : 'text-accent')}
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
                <Avatar {...(getMember(m.id) || m)} size="sm" />
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
        <label className="text-xs text-muted mb-1 block">Emby web URL</label>
        <Input
          value={s.emby?.webUrl || s.embyUrl || ''}
          onChange={(e) =>
            setS({
              ...s,
              embyUrl: e.target.value,
              emby: { ...s.emby, webUrl: e.target.value },
            })
          }
          placeholder="https://emby.example.com:8096"
          className="mb-1"
        />
        <p className="text-[11px] text-muted mb-3">
          Public browser URL for deep links. The API key is <strong>not</strong> set here — configure{' '}
          <code className="text-[10px]">EMBY_BASE_URL</code> and <code className="text-[10px]">EMBY_API_KEY</code>{' '}
          in Cloudflare Pages environment variables.
        </p>
        <label className="text-xs text-muted mb-1 block">Komga web URL</label>
        <Input
          value={s.komga?.webUrl || s.komgaUrl || ''}
          onChange={(e) =>
            setS({
              ...s,
              komgaUrl: e.target.value,
              komga: { ...s.komga, webUrl: e.target.value },
            })
          }
          placeholder="https://comics.example.com"
          className="mb-1"
        />
        <p className="text-[11px] text-muted mb-3">
          Public browser URL for deep links. API key is only in Cloudflare:{' '}
          <code className="text-[10px]">KOMGA_BASE_URL</code> +{' '}
          <code className="text-[10px]">KOMGA_API_KEY</code>. Progress follows the Komga user that
          owns that API key.
        </p>

        {isParent && (
          <div className="mt-2 pt-3 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-fg">Link Emby users to profiles</p>
            <p className="text-[11px] text-muted">
              Paste each person&apos;s Emby User ID (from Emby dashboard → Users). Identifier only — not a password.
            </p>
            {members
              .filter((m) => m.role !== 'media')
              .map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="text-sm w-28 shrink-0 truncate">
                    {m.emoji ? `${m.emoji} ` : ''}
                    {m.name}
                  </span>
                  <Input
                    value={m.embyUserId || ''}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((x) =>
                          x.id === m.id ? { ...x, embyUserId: e.target.value.trim() || undefined } : x,
                        ),
                      )
                    }
                    placeholder="Emby UserId"
                    className="flex-1"
                  />
                </div>
              ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Theme</h2>
        <div className="flex flex-wrap gap-2">
          {(['dark', 'light', 'neon'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setS({ ...s, theme: t })}
              className={cn(
                'px-4 py-2 rounded-xl text-sm capitalize',
                s.theme === t ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
              )}
            >
              {t === 'neon' ? 'Neon' : t}
            </button>
          ))}
        </div>
      </Card>

      
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <h2 className="font-semibold text-fg">Weather location</h2>
        <p className="text-xs text-muted">
          Used for the header chip and Home weather card (Open-Meteo, no API key). Defaults to
          Brisbane if unset.
        </p>
        {s.weather && (
          <p className="text-xs text-fg">
            Current: <span className="font-medium">{s.weather.label}</span>
            {' '}
            <span className="text-faint">
              ({s.weather.latitude.toFixed(2)}, {s.weather.longitude.toFixed(2)})
            </span>
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={weatherCityDraft}
            onChange={(e) => setWeatherCityDraft(e.target.value)}
            placeholder="City name, e.g. Brisbane"
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void (async () => {
                setWeatherLocMsg(null);
                try {
                  const loc = await geocodeCity(weatherCityDraft);
                  if (!loc) {
                    setWeatherLocMsg('No match for that city.');
                    return;
                  }
                  setS({ ...s, weather: loc });
                  saveStoredLocation(loc);
                  setWeatherLocMsg(`Set to ${loc.label}`);
                } catch (e) {
                  setWeatherLocMsg(e instanceof Error ? e.message : 'Lookup failed');
                }
              })();
            }}
          >
            Look up
          </Button>
        </div>
        {weatherLocMsg && <p className="text-xs text-muted">{weatherLocMsg}</p>}
      </div>

      <Button onClick={save} className="w-full">
        Save Settings
      </Button>
      <p className="text-xs text-muted text-center">
        {familyId ? 'Data syncs live to all devices in this family.' : 'Local-only until cloud is connected.'}
      </p>
    </div>
  );
}
