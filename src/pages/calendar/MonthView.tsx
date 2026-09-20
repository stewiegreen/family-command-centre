/**
 * Month grid for the family calendar.
 */
import { addDays, differenceInCalendarDays, format, isSameDay, isSameMonth, startOfDay } from 'date-fns';
import { Square } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { eventOverlapsDay } from '../../lib/recurrence';
import type { ExpandedEvent, Todo } from '../../types';
import { cn } from '../../lib/cn';
import { eventChipStyle, eventMemberIds, eventTitleLabel, formatEventTimeLabel } from './calendarUtils';
import { MemberFaces } from './MemberFaces';

export function MonthView({
  cursor,
  weeks,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
  onToggleTodo,
  onMoveEventToDay,
}: {
  cursor: Date;
  weeks: Date[][];
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string; avatarPortraitId?: string | null; avatarFlairShape?: string; avatarFlairColor?: string; initials?: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  onMoveEventToDay: (ev: ExpandedEvent, day: Date) => void;
}) {
  return (
    <Card className="!p-1.5 sm:!p-2 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="min-w-0 h-full min-h-0 flex flex-col">
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 shrink-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-sm text-muted font-semibold py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div
          className="flex-1 min-h-0 grid gap-0.5 sm:gap-1"
          style={{ gridTemplateRows: `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))` }}
        >
          {weeks.map((week) => (
            <MonthWeekRow
              key={week[0].toISOString()}
              week={week}
              cursor={cursor}
              expanded={expanded}
              tasksOnDay={tasksOnDay}
              taskExtra={taskExtra}
              getMember={getMember}
              memberColor={memberColor}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              onToggleTodo={onToggleTodo}
              onMoveEventToDay={onMoveEventToDay}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function MonthWeekRow({
  week,
  cursor,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
  onToggleTodo,
  onMoveEventToDay,
}: {
  week: Date[];
  cursor: Date;
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string; avatarPortraitId?: string | null; avatarFlairShape?: string; avatarFlairColor?: string; initials?: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  onMoveEventToDay: (ev: ExpandedEvent, day: Date) => void;
}) {
  // Multi-day / all-day spanning: events that cover more than one calendar day in this week
  const weekStart = startOfDay(week[0]);
  const weekEndExclusive = addDays(startOfDay(week[6]), 1);

  const spanning = expanded.filter((ev) => {
    const s = new Date(ev.instanceStart).getTime();
    const e = new Date(ev.instanceEnd).getTime();
    if (!(s < weekEndExclusive.getTime() && e > weekStart.getTime())) return false;
    const days = differenceInCalendarDays(new Date(ev.instanceEnd), new Date(ev.instanceStart));
    return ev.allDay || days >= 1;
  });

  // Single-day (or timed same-day) chips per day
  const dayLists = week.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const days = differenceInCalendarDays(new Date(ev.instanceEnd), new Date(ev.instanceStart));
      const isSpan = ev.allDay || days >= 1;
      return !isSpan;
    }),
  );

  // Layout spanning bars: assign rows so they don't overlap
  type SpanLayout = { ev: ExpandedEvent; startCol: number; endCol: number; row: number };
  const layouts: SpanLayout[] = [];
  const rowEnds: number[] = []; // endCol exclusive per row

  const sortedSpan = [...spanning].sort(
    (a, b) => new Date(a.instanceStart).getTime() - new Date(b.instanceStart).getTime(),
  );

  for (const ev of sortedSpan) {
    let startCol = 0;
    let endCol = 7;
    for (let i = 0; i < 7; i++) {
      if (eventOverlapsDay(ev, week[i])) {
        startCol = i;
        break;
      }
    }
    for (let i = 6; i >= 0; i--) {
      if (eventOverlapsDay(ev, week[i])) {
        endCol = i + 1;
        break;
      }
    }
    let row = 0;
    while (rowEnds[row] != null && rowEnds[row]! > startCol) row++;
    rowEnds[row] = endCol;
    layouts.push({ ev, startCol, endCol, row });
  }

  const spanRows = Math.max(0, ...layouts.map((l) => l.row + 1), 0);

  return (
    <div className="relative h-full min-h-0">
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 h-full min-h-0">
        {week.map((day, di) => {
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const list = dayLists[di];
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const raw = e.dataTransfer.getData('application/x-fcc-event');
                if (!raw) return;
                try {
                  const parsed = JSON.parse(raw) as ExpandedEvent;
                  onMoveEventToDay(parsed, day);
                } catch {
                  /* ignore */
                }
              }}
              className={cn(
                'h-full min-h-0 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-left transition-colors flex flex-col overflow-hidden',
                inMonth ? 'hover:bg-nav-hover' : 'opacity-40',
                isToday && 'ring-1 ring-accent/50 bg-accent/10',
              )}
            >
              <span className={cn('text-base font-bold leading-none mb-1', isToday ? 'text-accent' : 'text-muted')}>
                {format(day, 'd')}
              </span>
              {/* Spacer for spanning bars */}
              <div style={{ height: spanRows * 22 }} className="shrink-0" />
              <div className="mt-0.5 space-y-1 flex-1 min-h-0">
                {list.slice(0, 3).map((ev) => {
                  const ids = eventMemberIds(ev);
                  const names = ids
                    .map((id) => getMember(id))
                    .filter(Boolean)
                    .map((m) => (m ? `${m.emoji || ''} ${m.name}`.trim() : ''))
                    .join(', ');
                  return (
                    <div
                      key={ev.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData('application/x-fcc-event', JSON.stringify(ev));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className="text-xs sm:text-[13px] truncate px-1.5 py-1 rounded-md flex items-center gap-1 leading-snug cursor-grab active:cursor-grabbing font-medium"
                      style={eventChipStyle(ev, memberColor, { alpha: '48' })}
                      title={(names ? names + ': ' : '') + formatEventTimeLabel(ev) + ev.title}
                    >
                      <MemberFaces ids={ids} getMember={getMember} />
                      <span className="truncate">
                        {formatEventTimeLabel(ev)}
                        {eventTitleLabel(ev)}
                        {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
                      </span>
                    </div>
                  );
                })}
                {tasksOnDay(day).slice(0, 2).map((t) => (
                  <div
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTodo(t.id);
                    }}
                    className="text-xs sm:text-[13px] truncate px-1.5 py-1 rounded-md flex items-center gap-1 border border-dashed border-warn/50 bg-warn-tint text-warn leading-snug font-medium"
                    title={`Task: ${t.text}${taskExtra(t)} (tap to complete)`}
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.text}{taskExtra(t)}</span>
                  </div>
                ))}
                {(list.length > 3 || tasksOnDay(day).length > 2) && (
                  <span className="text-xs text-muted pl-1 font-medium">
                    +{Math.max(0, list.length - 3) + Math.max(0, tasksOnDay(day).length - 2)} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* Spanning bars overlaid on the week row */}
      {layouts.map(({ ev, startCol, endCol, row }) => {
        const ids = eventMemberIds(ev);
        const names = ids
          .map((id) => getMember(id))
          .filter(Boolean)
          .map((m) => (m ? `${m.emoji || ''} ${m.name}`.trim() : ''))
          .join(', ');
                return (
          <div
            key={ev.id + '-span'}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData('application/x-fcc-event', JSON.stringify(ev));
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="absolute pointer-events-auto text-xs sm:text-[13px] truncate px-1.5 rounded-md font-semibold cursor-grab active:cursor-grabbing z-[1] leading-snug"
            style={{
              left: `calc(${(startCol / 7) * 100}% + 2px)`,
              width: `calc(${((endCol - startCol) / 7) * 100}% - 4px)`,
              top: 28 + row * 22,
              height: 20,
              ...eventChipStyle(ev, memberColor, { alpha: '60' }),
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev);
            }}
            title={(names ? names + ': ' : '') + ev.title}
          >
            <span className="inline-flex items-center gap-1">
              <MemberFaces ids={ids} getMember={getMember} />
              <span className="truncate">
                {eventTitleLabel(ev)}
                {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ——— Week / Day time grid ——— */

