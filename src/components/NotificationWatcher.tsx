import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  getLastAnnouncementNotified,
  isNotificationsEnabled,
  markAnnouncementNotified,
  markEventNotified,
  markMessageNotified,
  markTodoNotified,
  seedNotificationBaseline,
  showLocalNotification,
  wasEventNotified,
  wasMessageNotified,
  wasTodoNotified,
} from '../lib/notifications';
import { upcomingExpanded } from '../lib/recurrence';

/**
 * Watches live family data and fires local notifications when enabled.
 * Suppresses noise on first enable by seeding a baseline of current IDs.
 */
export function NotificationWatcher() {
  const { data, currentUser, getMember, setView } = useApp();
  const [enabled, setEnabled] = useState(isNotificationsEnabled);
  const me = currentUser?.id || data.settings.currentUserId;
  const seeded = useRef(false);
  const prevEnabled = useRef(enabled);

  // Re-read preference when storage changes (Settings toggle on same tab via event)
  useEffect(() => {
    const sync = () => setEnabled(isNotificationsEnabled());
    window.addEventListener('fcc:notif-pref', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('fcc:notif-pref', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Navigate when user clicks a notification (SW postMessage or custom event)
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as { view?: string } | undefined;
      if (detail?.view) setView(detail.view as Parameters<typeof setView>[0]);
    };
    const onSwMsg = (e: MessageEvent) => {
      if (e.data?.type === 'fcc:navigate' && e.data.view) {
        setView(e.data.view);
      }
    };
    window.addEventListener('fcc:navigate', onNav);
    navigator.serviceWorker?.addEventListener('message', onSwMsg);
    return () => {
      window.removeEventListener('fcc:navigate', onNav);
      navigator.serviceWorker?.removeEventListener('message', onSwMsg);
    };
  }, [setView]);

  // Seed baseline when notifications are turned on so existing items don't fire
  useEffect(() => {
    if (enabled && !prevEnabled.current) {
      seeded.current = false;
    }
    prevEnabled.current = enabled;
    if (!enabled || !me || seeded.current) return;

    const now = Date.now();
    seedNotificationBaseline({
      messageIds: data.messages.filter((m) => m.toId === me).map((m) => m.id),
      todoKeys: data.todos
        .filter((t) => !t.completed && t.memberId === me)
        .map((t) => `${t.id}:${t.dueAt || t.priority}`),
      eventKeys: data.events
        .filter((ev) => {
          const start = new Date(ev.start).getTime();
          return start >= now && start - now <= 60 * 60 * 1000;
        })
        .map((ev) => `${ev.id}:soon`),
      announcement: data.settings.pinnedAnnouncement || '',
    });
    seeded.current = true;
  }, [enabled, me, data.messages, data.todos, data.events, data.settings.pinnedAnnouncement]);

  // Message + announcement watchers (react to data changes)
  useEffect(() => {
    if (!enabled || !me || !seeded.current) return;

    // New unread messages for me
    for (const m of data.messages) {
      if (m.toId !== me || m.read) continue;
      if (wasMessageNotified(m.id)) continue;
      const from = getMember(m.fromId);
      void showLocalNotification('New message', {
        body: `${from?.emoji ? from.emoji + ' ' : ''}${from?.name || 'Someone'}: ${m.text.slice(0, 120)}`,
        tag: `msg-${m.id}`,
        data: { view: 'messages' },
      });
      markMessageNotified(m.id);
    }

    // Pinned announcement changed
    const ann = (data.settings.pinnedAnnouncement || '').trim();
    if (ann && ann !== getLastAnnouncementNotified()) {
      // Only notify if we already had a baseline (not first seed)
      const prev = getLastAnnouncementNotified();
      if (prev && prev !== ann) {
        void showLocalNotification('Family announcement', {
          body: ann.slice(0, 160),
          tag: 'announcement',
          data: { view: 'dashboard' },
        });
      }
      markAnnouncementNotified(ann);
    }
  }, [enabled, me, data.messages, data.members, data.appearance, data.settings.pinnedAnnouncement, getMember]);

  // Todos due soon / high priority + calendar soon — poll every minute
  useEffect(() => {
    if (!enabled || !me) return;

    const check = () => {
      if (!seeded.current) return;
      const now = Date.now();
      const in24h = now + 24 * 60 * 60 * 1000;

      for (const t of data.todos) {
        if (t.completed || t.memberId !== me) continue;
        const due = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
        const dueSoon = !Number.isNaN(due) && due <= in24h;
        const high = t.priority === 'high';
        if (!dueSoon && !high) continue;
        const key = `${t.id}:${t.dueAt || t.priority}`;
        if (wasTodoNotified(key)) continue;
        const overdue = !Number.isNaN(due) && due < now;
        const body = overdue
          ? `Overdue: ${t.text}`
          : dueSoon
            ? `Due ${new Date(t.dueAt!).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: ${t.text}`
            : `High priority: ${t.text}`;
        void showLocalNotification('To-do reminder', {
          body: body.slice(0, 160),
          tag: `todo-${t.id}`,
          data: { view: 'todos' },
        });
        markTodoNotified(key);
      }

      // Calendar reminders: 1h and 15m before start; assigned to me (or unassigned family)
      const upcoming = upcomingExpanded(data.events, new Date(now), 2);
      const windows: { label: string; maxLead: number; minLead: number }[] = [
        { label: '1h', maxLead: 60 * 60 * 1000, minLead: 45 * 60 * 1000 },
        { label: '15m', maxLead: 15 * 60 * 1000, minLead: 0 },
      ];
      for (const ev of upcoming) {
        if (ev.allDay) continue; // all-day handled below
        const memberIds =
          ev.memberIds && ev.memberIds.length > 0
            ? ev.memberIds
            : ev.memberId
              ? [ev.memberId]
              : [];
        // Notify if I'm assigned, or event has no clear assignee list beyond legacy
        if (memberIds.length > 0 && !memberIds.includes(me)) continue;

        const start = new Date(ev.instanceStart).getTime();
        if (start < now) continue;
        const lead = start - now;
        for (const w of windows) {
          if (lead > w.maxLead || lead < w.minLead) continue;
          const key = `${ev.id}:${w.label}`;
          if (wasEventNotified(key)) continue;
          const when = new Date(ev.instanceStart).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });
          const body =
            w.label === '15m'
              ? `${ev.title} starts in 15 minutes (${when})`
              : `${ev.title} at ${when}`;
          void showLocalNotification('Upcoming event', {
            body: body.slice(0, 160),
            tag: `event-${ev.id}-${w.label}`,
            data: { view: 'calendar' },
          });
          markEventNotified(key);
        }
      }

      // All-day events: remind once on the morning of (05:00–10:00 local)
      const hourNow = new Date(now).getHours();
      if (hourNow >= 5 && hourNow < 10) {
        for (const ev of upcoming) {
          if (!ev.allDay) continue;
          const memberIds =
            ev.memberIds && ev.memberIds.length > 0
              ? ev.memberIds
              : ev.memberId
                ? [ev.memberId]
                : [];
          if (memberIds.length > 0 && !memberIds.includes(me)) continue;
          const dayKey = new Date(ev.instanceStart).toDateString();
          if (dayKey !== new Date(now).toDateString()) continue;
          const key = `${ev.masterId || ev.id}:allday:${dayKey}`;
          if (wasEventNotified(key)) continue;
          void showLocalNotification('Today', {
            body: ev.title.slice(0, 160),
            tag: `event-allday-${ev.masterId || ev.id}`,
            data: { view: 'calendar' },
          });
          markEventNotified(key);
        }
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, me, data.todos, data.events]);

  return null;
}
