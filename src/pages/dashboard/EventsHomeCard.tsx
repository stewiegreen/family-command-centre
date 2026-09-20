/**
 * Homescreen "Upcoming Events" widget (list + dot-calendar flip).
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Users } from 'lucide-react';
import { FlipCard } from '../../components/FlipCard';
import { EventsDotCalendar } from '../../components/EventsDotCalendar';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { eventAssigneeIds } from './constants';
import type { CalendarEvent, ExpandedEvent } from '../../types';

type MemberLite = {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  avatarPortraitId?: string | null;
  avatarFlairShape?: string;
  avatarFlairColor?: string;
  initials?: string;
};

export function EventsHomeCard({
  upcoming,
  household,
  getMember,
  filterMemberId: filterMemberIdProp,
  onFilterMemberId,
  onQuickAdd,
  onOpenEvent,
  onOpenCalendar,
}: {
  /** Already filtered to the selected member when controlled from parent. */
  upcoming: ExpandedEvent[];
  household: MemberLite[];
  getMember: (id: string) => MemberLite | undefined;
  filterMemberId: string;
  onFilterMemberId: (id: string) => void;
  onQuickAdd: (title: string) => void;
  onOpenEvent: (ev: ExpandedEvent | CalendarEvent) => void;
  onOpenCalendar: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);
  const filterMemberId = filterMemberIdProp;

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filterOpen]);

  const setFilter = (id: string) => {
    onFilterMemberId(id);
    setFilterOpen(false);
  };

  const quickAdd = () => {
    const title = draft.trim();
    if (!title) return;
    onQuickAdd(title);
    setDraft('');
  };

  return (
    <FlipCard
      storageKey="events-dotcal"
      frontLabel="List"
      backLabel="Calendar"
      front={
        <Card className="h-full flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-fg shrink-0 text-lg">Upcoming Events</h2>
              <div className="relative" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => setFilterOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-2 pl-1 pr-2 py-1 text-sm text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-accent/40 max-w-[10.5rem] sm:max-w-[12rem]"
                  title="Whose events to show"
                  aria-haspopup="listbox"
                  aria-expanded={filterOpen}
                >
                  {filterMemberId === 'all' ? (
                    <span className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-muted" />
                    </span>
                  ) : (
                    <Avatar
                      size="sm"
                      className="!w-7 !h-7 !text-sm"
                      {...(getMember(filterMemberId) || { name: 'Member' })}
                    />
                  )}
                  <span className="truncate font-medium">
                    {filterMemberId === 'all'
                      ? 'Everyone'
                      : getMember(filterMemberId)?.name || 'Member'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                </button>
                {filterOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] max-h-72 overflow-auto rounded-xl border border-border-strong bg-surface-1 shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={filterMemberId === 'all'}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                        filterMemberId === 'all' && 'bg-accent/15 text-accent',
                      )}
                      onClick={() => setFilter('all')}
                    >
                      <span className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                        <Users className="w-3.5 h-3.5 text-muted" />
                      </span>
                      Everyone
                    </button>
                    {household.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={filterMemberId === m.id}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                          filterMemberId === m.id && 'bg-accent/15 text-accent',
                        )}
                        onClick={() => setFilter(m.id)}
                      >
                        <Avatar size="sm" className="!w-7 !h-7 !text-sm" {...m} />
                        <span className="truncate">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="text-xs font-medium text-accent hover:underline shrink-0"
            >
              Open calendar →
            </button>
          </div>
          <div className="flex gap-2 mb-1">
            <input
              className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              placeholder="Quick add event for today…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') quickAdd();
              }}
            />
            <Button size="sm" onClick={quickAdd} disabled={!draft.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-faint mb-2">
            Quick add creates an all-day event for today. Open Calendar for times.
          </p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">No upcoming events. Enjoy the calm! ☀️</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
              {upcoming.map((ev) => {
                const ids = eventAssigneeIds(ev);
                const primary = getMember(ids[0] || ev.memberId);
                const who = ids
                  .map((id) => getMember(id)?.name)
                  .filter(Boolean)
                  .join(', ');
                const when = new Date(ev.instanceStart || ev.start);
                return (
                  <button
                    key={`${ev.masterId || ev.id}-${ev.instanceStart || ev.start}`}
                    type="button"
                    onClick={() => onOpenEvent(ev)}
                    className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-accent/40 hover:bg-nav-hover/40 transition-colors"
                    style={{
                      backgroundColor: (primary?.color || '#6366f1') + '14',
                      borderLeftWidth: 4,
                      borderLeftColor: primary?.color || '#6366f1',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-fg truncate">{ev.title}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {when.toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: ev.allDay ? undefined : 'numeric',
                          minute: ev.allDay ? undefined : '2-digit',
                        })}
                        {who ? ` · ${who}` : ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-accent shrink-0 mt-0.5">Edit</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      }
      back={<EventsDotCalendar filterMemberId={filterMemberId} />}
    />
  );
}
