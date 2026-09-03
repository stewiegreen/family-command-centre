import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { AuthScreen } from './components/AuthScreen';
import { FamilySetupScreen } from './components/FamilySetupScreen';
import { Dashboard } from './pages/Dashboard';
import { CalendarPage } from './pages/CalendarPage';
import { TodosPage } from './pages/TodosPage';
import { ChoresPage } from './pages/ChoresPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { NotesPage } from './pages/NotesPage';
import { JournalPage } from './pages/JournalPage';
import { MessagesPage } from './pages/MessagesPage';
import { MediaPage } from './pages/MediaPage';
import { SettingsPage } from './pages/SettingsPage';
import { KidPinGate } from './components/PinGate';
import { NotificationWatcher } from './components/NotificationWatcher';
import { QuickAddFab } from './components/QuickAddFab';
import { HAS_BUILT_IN_CONFIG } from './lib/firebaseConfig';
import { registerNotificationSw } from './lib/notifications';

function AppShell() {
  const {
    view,
    isParent,
    isMediaOnly,
    setView,
    authReady,
    authUser,
    needsFamilySetup,
    cloudReady,
    familyId,
    loadCloudConfig,
    syncStatus,
  } = useApp();

  useEffect(() => {
    void registerNotificationSw();
  }, []);

  useEffect(() => {
    if (isMediaOnly && view !== 'media') setView('media');
    else if (view === 'settings' && !isParent) setView(isMediaOnly ? 'media' : 'dashboard');
  }, [view, isParent, isMediaOnly, setView]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page text-muted text-sm">
        Loading…
      </div>
    );
  }

  const hasCfg = HAS_BUILT_IN_CONFIG || !!loadCloudConfig();

  // Built-in or saved config: require sign-in before the main app
  if (hasCfg && !authUser) {
    // Wait until cloud init finished (or failed into auth screen anyway)
    if (!cloudReady && syncStatus === 'connecting') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-page text-muted text-sm">
          Connecting…
        </div>
      );
    }
    return <AuthScreen />;
  }

  if (authUser && (needsFamilySetup || !familyId) && syncStatus !== 'live' && syncStatus !== 'connecting') {
    return <FamilySetupScreen />;
  }

  return (
    <KidPinGate>
      <NotificationWatcher />
      <Layout>
        {isMediaOnly ? (
          <MediaPage />
        ) : (
          <>
            {view === 'dashboard' && <Dashboard />}
            {view === 'calendar' && <CalendarPage />}
            {view === 'todos' && <TodosPage />}
            {view === 'chores' && <ChoresPage />}
            {view === 'shopping' && <ShoppingPage />}
            {view === 'notes' && <NotesPage />}
            {view === 'journal' && <JournalPage />}
            {view === 'messages' && <MessagesPage />}
            {view === 'media' && <MediaPage />}
            {view === 'settings' && isParent && <SettingsPage />}
          </>
        )}
        <QuickAddFab />
      </Layout>
    </KidPinGate>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
