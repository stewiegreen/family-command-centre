import { useEffect, useState, type ReactNode } from 'react';
import {
  Home,
  Calendar,
  CheckSquare,
  Sword,
  StickyNote,
  BookOpen,
  ChefHat,
  MessageCircle,
  Film,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  BellOff,
  ShoppingCart,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { ProfileSwitcher } from './ProfileSwitcher';
import { cn } from '../lib/cn';
import { WeatherHeaderChip } from './WeatherHeaderChip';
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
  { id: 'chores', label: 'Chores', icon: Sword },
  { id: 'shopping', label: 'Shopping', icon: ShoppingCart },
  { id: 'recipes', label: 'Recipes', icon: ChefHat },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'media', label: 'Media', icon: Film },
];

const SIDEBAR_KEY = 'fcc-sidebar-collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const {
    data,
    view,
    setView,
    currentUser,
    isParent,
    isMediaOnly,
    syncStatus,
    cloudError,
    pendingWrites,
    familyId,
    signOut,
    authUser,
  } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(loadCollapsed);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifOn, setNotifOn] = useState(isNotificationsEnabled);
  const { settings } = data;

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

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
      'w-full flex items-center rounded-xl text-sm font-medium transition-all',
      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
      active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-nav-hover hover:text-fg',
    );

  return (
    <div className="h-dvh max-h-dvh flex overflow-hidden bg-page text-fg">
      {cloudError && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-red-500 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
          <span>⚠️ Something didn't save: {cloudError}. Don't close this yet — trying again.</span>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0 h-full max-h-dvh border-r border-border bg-sidebar transition-[width] duration-200 ease-out',
          collapsed ? 'w-[4.25rem]' : 'w-64',
        )}
      >
        <div className={cn('border-b border-border', collapsed ? 'p-3' : 'p-5')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
            <img
              src="/hq-mark.png"
              alt="GreenHQ"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl shrink-0 shadow-sm"
              title={settings.familyName}
            />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-semibold truncate text-fg">{settings.familyName}</h1>
                <p className="text-xs text-faint">
                  {pendingWrites > 0 ? (
                    <span className="text-amber-500">● Saving…</span>
                  ) : cloudError ? (
                    <span className="text-red-500" title={cloudError}>
                      ● Not saved — {cloudError}
                    </span>
                  ) : syncStatus === 'live' ? (
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
            )}
          </div>
        </div>

        <nav className={cn('flex-1 min-h-0 overflow-y-auto space-y-1', collapsed ? 'p-2' : 'p-3')}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={navBtn(view === item.id)}
              title={item.label}
            >
              <span className="relative">
                <item.icon className="w-5 h-5 shrink-0" />
                {item.id === 'messages' && unread > 0 && collapsed && (
                  <span className="absolute -top-1 -right-1 bg-accent text-accent-ink text-[9px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === 'messages' && unread > 0 && (
                    <span className="bg-accent text-accent-ink text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {unread}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className={cn('border-t border-border space-y-2', collapsed ? 'p-2' : 'p-3')}>
          {isParent && (
            <button
              type="button"
              onClick={() => setView('settings')}
              className={navBtn(view === 'settings')}
              title="Settings"
            >
              <Settings className="w-5 h-5 shrink-0" />
              {!collapsed && 'Settings'}
            </button>
          )}

          {currentUser && !collapsed && (
            <div className="pt-2 px-2 space-y-2">
              <p className="text-xs text-faint px-1 mb-1">Signed in as</p>
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="w-full flex items-center gap-2.5 px-1 py-1.5 rounded-xl bg-surface-2 border border-border hover:border-accent/40 transition text-left"
                title="Switch profile"
              >
                <Avatar {...currentUser} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-fg">{currentUser.name}</p>
                  <p className="text-[11px] text-faint capitalize">{currentUser.role}</p>
                </div>
              </button>
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

          {currentUser && collapsed && (
            <div className="flex flex-col items-center gap-1">
              <button type="button" onClick={() => setSwitcherOpen(true)} title="Switch profile">
                <Avatar {...currentUser} size="sm" />
              </button>
              <button
                type="button"
                onClick={() => void toggleNotifs()}
                className={cn(
                  'p-2 rounded-xl transition-colors',
                  notifOn ? 'text-accent hover:bg-accent/10' : 'text-muted hover:bg-nav-hover',
                )}
                title={notifOn ? 'Notifications on' : 'Enable notifications'}
              >
                {notifOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              {authUser && (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="p-2 rounded-xl text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-border bg-header backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-nav-hover text-muted"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Desktop: toggle sidebar collapse from the header */}
            <button
              type="button"
              className="hidden lg:inline-flex p-2 -ml-1 rounded-xl hover:bg-nav-hover text-muted"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-fg">
                Hey, {currentUser?.name || 'there'} 👋
              </p>
              <p className="text-xs text-faint hidden sm:block">
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WeatherHeaderChip />
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
            {currentUser && (
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="rounded-full ring-offset-2 ring-offset-page hover:ring-2 hover:ring-accent/50 transition"
                title="Switch profile"
              >
                <Avatar {...currentUser} size="sm" />
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto pb-6">{children}</main>
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-[min(100%,18rem)] max-w-full h-full bg-sidebar border-r border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/hq-mark.png"
                  alt="GreenHQ"
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-xl shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{settings.familyName}</p>
                  <p className="text-xs text-faint truncate">
                    {pendingWrites > 0
                      ? 'Saving…'
                      : cloudError
                        ? 'Not saved — check connection'
                        : syncStatus === 'live'
                          ? 'Live sync'
                          : 'Local'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-nav-hover text-muted"
                onClick={() => setSidebarOpen(false)}
              >
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
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    view === item.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:bg-nav-hover hover:text-fg',
                  )}
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
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    view === 'settings'
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:bg-nav-hover hover:text-fg',
                  )}
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
      <ProfileSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </div>
  );
}

