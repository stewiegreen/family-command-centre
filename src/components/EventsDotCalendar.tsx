import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/Card';
import { expandEvents } from '../lib/recurrence';
import { cn } from '../lib/cn';

function eventAssigneeIds(ev: { memberId: string; memberIds?: string[] }): string[] {
  if (ev.memberIds && ev.memberIds.length > 0) return ev.memberIds;
  return ev.memberId ? [ev.memberId] : [];
}

function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Compact month grid: coloured dots under days that have events
 * (one dot colour per assigned member, capped for space).
 */
export function EventsDotCalendar({
  filterMemberId = 'all',
}: {
  filterMemberId?: string;
}) {
  const { data, getMember, setView } = useApp();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = startOfDay(new Date());

  const { days, dotsByDay } = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    // Exclusive end for expandEvents
    const rangeEndExcl = new Date(gridEnd);
    rangeEndExcl.setDate(rangeEndExcl.getDate() + 1);

    const expanded = expandEvents(data.events || [], gridStart, rangeEndExcl).filter((ev) =>
      filterMemberId === 'all' ? true : eventAssigneeIds(ev).includes(filterMemberId),
    );

    const map = new Map<string, { color: string; name: string }[]>();
    for (const ev of expanded) {
      const start = startOfDay(new Date(ev.instanceStart || ev.start));
      const end = startOfDay(new Date(ev.instanceEnd || ev.end || ev.start));
      // Walk inclusive days the instance covers (cap multi-day)
      let d = start;
      let guard = 0;
      while (d.getTime() <= end.getTime() && guard < 14) {
        const key = dayKey(d);
        const ids = eventAssigneeIds(ev);
        const existing = map.get(key) || [];
        const seen = new Set(existing.map((x) => x.color));
        for (const id of ids.length ? ids : ['']) {
          const m = id ? getMember(id) : undefined;
          const color = m?.color || '#6366f1';
          if (seen.has(color)) continue;
          seen.add(color);
          existing.push({ color, name: m?.name || 'Event' });
        }
        map.set(key, existing.slice(0, 4));
        d = new Date(d);
        d.setDate(d.getDate() + 1);
        guard += 1;
      }
    }

    return { days, dotsByDay: map };
  }, [cursor, data.events, filterMemberId, getMember]);

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card className="!p-4 lg:!p-5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-fg flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" />
          {format(cursor, 'MMMM')}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className="text-xs text-accent ml-1 shrink-0"
          >
            Full →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium text-faint mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={`${d}-${i}`}>{d}</div>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-0.5 min-h-0">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 flex-1 min-h-[2.5rem]">
            {week.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, today);
              const dots = dotsByDay.get(dayKey(day)) || [];
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setView('calendar')}
                  className={cn(
                    'flex flex-col items-center justify-start pt-0.5 rounded-lg transition-colors',
                    inMonth ? 'text-fg' : 'text-faint/50',
                    isToday && 'bg-accent/15',
                    'hover:bg-nav-hover/60',
                  )}
                  title={
                    dots.length
                      ? `${format(day, 'MMM d')}: ${dots.map((d) => d.name).join(', ')}`
                      : format(day, 'MMM d')
                  }
                >
                  <span
                    className={cn(
                      'text-xs tabular-nums leading-none w-6 h-6 flex items-center justify-center rounded-full',
                      isToday && 'font-bold text-accent',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <span className="flex items-center justify-center gap-0.5 h-2 mt-0.5 min-h-[0.5rem]">
                    {dots.map((d, i) => (
                      <span
                        key={`${d.color}-${i}`}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-faint mt-2 text-center">
        Dots = events
        {filterMemberId !== 'all' ? ' for selected person' : ' by person colour'}
      </p>
    </Card>
  );
}
