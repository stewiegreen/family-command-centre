import { useEffect, useState, type ReactNode } from 'react';
import {
  Home,
  Calendar,
  CheckSquare,
  RefreshCw,
  StickyNote,
  MessageCircle,
  Film,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  BellOff,
  ShoppingCart,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { cn } from '../lib/cn';
import type { ViewId } from '../types';
import {
  getNotificationPermission,
  isNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../lib/notifications';

const NAV: { id: ViewId; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'todos', label: 'To-Dos', icon: CheckSquare },
  { id: 'chores', label: 'Chores', icon: RefreshCw },
  { id: 'shopping', label: 'Shopping', icon: ShoppingCart },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'media', label: 'Media', icon: Film },
];

export function Layout({ children }: { children: ReactNode }) {
  const { data, view, setView, currentUser, isParent, isMediaOnly, syncStatus, familyId, signOut, authUser } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifOn, setNotifOn] = useState(isNotificationsEnabled);
  const { settings } = data;

  useEffect(() => {
    const sync = () => setNotifOn(isNotificationsEnabled());
    window.addEventListener('fcc:notif-pref', sync);
    return () => window.removeEventListener('fcc:notif-pref', sync);
  }, []);

  const toggleNotifs = async () => {
    if (notifOn) {
      setNotificationsEnabled(false);
      setNotifOn(false);
      window.dispatchEvent(new Event('fcc:notif-pref'));
      return;
    }
    let perm = getNotificationPermission();
    if (perm === 'default') perm = await requestNotificationPermission();
    if (perm !== 'granted') return;
    setNotificationsEnabled(true);
    setNotifOn(true);
    window.dispatchEvent(new Event('fcc:notif-pref'));
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const unread = data.messages.filter((m) => m.toId === settings.currentUserId && !m.read).length;
  const navItems = isMediaOnly ? NAV.filter((i) => i.id === 'media') : NAV;

  const navBtn = (active: boolean) =>
    cn(
      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
      active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-nav-hover hover:text-fg',
    );

  return (
    <div className="min-h-dvh flex bg-page text-fg">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-sidebar">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-ink font-bold text-lg">
              {settings.familyName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold truncate text-fg">{settings.familyName}</h1>
              <p className="text-xs text-faint">
                {syncStatus === 'live' ? (
                  <span className="text-accent">● Live{familyId ? ` · ${familyId}` : ''}</span>
                ) : syncStatus === 'connecting' ? (
                  <span className="text-amber-500">● Syncing…</span>
                ) : syncStatus === 'error' ? (
                  <span className="text-red-500">● Offline</span>
                ) : (
                  'Command Centre · local'
                )}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button key={item.id} type="button" onClick={() => setView(item.id)} className={navBtn(view === item.id)}>
              <item.icon className="w-5 h-5" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'messages' && unread > 0 && (
                <span className="bg-accent text-accent-ink text-xs font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          {isParent && (
            <button type="button" onClick={() => setView('settings')} className={navBtn(view === 'settings')}>
              <Settings className="w-5 h-5" /> Settings
            </button>
          )}
          {currentUser && (
            <div className="pt-2 px-2 space-y-2">
              <p className="text-xs text-faint px-1 mb-1">Signed in as</p>
              <div className="flex items-center gap-2.5 px-1 py-1.5 rounded-xl bg-surface-2 border border-border">
                <Avatar {...currentUser} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-fg">{currentUser.name}</p>
                  <p className="text-[11px] text-faint capitalize">{currentUser.role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggleNotifs()}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  notifOn
                    ? 'text-accent bg-accent/10 hover:bg-accent/15'
                    : 'text-muted hover:bg-nav-hover hover:text-fg',
                )}
              >
                {notifOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {notifOn ? 'Notifications on' : 'Enable notifications'}
              </button>
              {authUser && (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  {signingOut ? 'Signing out…' : 'Log out'}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-border bg-header backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-nav-hover text-muted"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-fg">Hey, {currentUser?.name || 'there'} 👋</p>
              <p className="text-xs text-faint hidden sm:block">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleNotifs()}
              className={cn(
                'p-2 rounded-xl transition-colors',
                notifOn ? 'text-accent hover:bg-accent/10' : 'text-muted hover:bg-nav-hover',
              )}
              title={notifOn ? 'Notifications on — click to disable' : 'Enable notifications'}
            >
              {notifOn ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            {currentUser && <Avatar {...currentUser} size="sm" />}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-6">{children}</main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-header backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-xl',
                view === item.id ? 'text-accent' : 'text-faint',
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.id === 'messages' && unread > 0 && (
                <span className="absolute top-1 right-1.5 bg-accent text-accent-ink text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Quick-add lives only on Home — see QuickAddFab in App */}

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-surface border-r border-border flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-fg">{settings.familyName}</h2>
              <button type="button" onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-nav-hover text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setView(item.id);
                    setSidebarOpen(false);
                  }}
                  className={navBtn(view === item.id)}
                >
                  <item.icon className="w-5 h-5" /> {item.label}
                </button>
              ))}
              {isParent && (
                <button
                  type="button"
                  onClick={() => {
                    setView('settings');
                    setSidebarOpen(false);
                  }}
                  className={navBtn(view === 'settings')}
                >
                  <Settings className="w-5 h-5" /> Settings
                </button>
              )}
            </nav>
            {currentUser && (
              <div className="p-3 border-t border-border space-y-2">
                <div className="flex items-center gap-2.5 px-1 py-1.5 rounded-xl bg-surface-2 border border-border">
                  <Avatar {...currentUser} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-fg">{currentUser.name}</p>
                    <p className="text-[11px] text-faint capitalize">{currentUser.role}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleNotifs()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    notifOn
                      ? 'text-accent bg-accent/10 hover:bg-accent/15'
                      : 'text-muted hover:bg-nav-hover hover:text-fg',
                  )}
                >
                  {notifOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  {notifOn ? 'Notifications on' : 'Enable notifications'}
                </button>
                {authUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setSidebarOpen(false);
                      void handleSignOut();
                    }}
                    disabled={signingOut}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    {signingOut ? 'Signing out…' : 'Log out'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
