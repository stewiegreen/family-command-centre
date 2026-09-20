/**
 * Week / day time-grid with drag-create, move, and resize.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { differenceInCalendarDays, format, isSameDay } from 'date-fns';
import { Square } from 'lucide-react';
import { eventOverlapsDay, packOverlapping } from '../../lib/recurrence';
import type { ExpandedEvent, Todo } from '../../types';
import { cn } from '../../lib/cn';
import {
  HOUR_END,
  HOUR_HEIGHT,
  HOUR_START,
  SNAP_MIN,
  eventChipStyle,
  eventMemberIds,
  eventTitleLabel,
  formatEventTimeLabel,
  snapMins,
  yToMins,
} from './calendarUtils';
import { MemberFaces } from './MemberFaces';

export function TimeGridView({
  days,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onSlotClick,
  onCreateRange,
  onResizeEvent,
  onEventClick,
  onToggleTodo,
  showDayHeaders,
}: {
  days: Date[];
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string; avatarPortraitId?: string | null; avatarFlairShape?: string; avatarFlairColor?: string; initials?: string } | undefined;
  memberColor: (id: string) => string;
  onSlotClick: (d: Date, hour: number) => void;
  onCreateRange: (day: Date, startMins: number, endMins: number) => void;
  onResizeEvent: (ev: ExpandedEvent, newStart: Date, newEnd: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  showDayHeaders: boolean;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
  const colMinPx = days.length > 1 ? 112 : 0; // wider columns on week view for phones

  const allDayByDay = days.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const spanDays = differenceInCalendarDays(
        new Date(ev.instanceEnd),
        new Date(ev.instanceStart),
      );
      return ev.allDay || spanDays >= 1;
    }),
  );

  const timedByDay = days.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const spanDays = differenceInCalendarDays(
        new Date(ev.instanceEnd),
        new Date(ev.instanceStart),
      );
      return !ev.allDay && spanDays < 1;
    }),
  );

  const packs = timedByDay.map((list) => packOverlapping(list));

  // Drag-create state
  const [draft, setDraft] = useState<null | {
    dayIndex: number;
    startMins: number;
    endMins: number;
  }>(null);
  const dragMode = useRef<'none' | 'create' | 'resize-start' | 'resize-end' | 'move'>('none');
  const moveOffsetMins = useRef(0); // pointer mins - event start mins at grab
  const moveDurationMins = useRef(60);
  const dragEv = useRef<ExpandedEvent | null>(null);
  const resizeDraft = useRef<{ start: Date; end: Date } | null>(null);
  const gridEls = useRef<(HTMLDivElement | null)[]>([]);
  const suppressClick = useRef(false);
  // Local preview overrides while resizing (event id → times)
  const [resizePreview, setResizePreview] = useState<Record<
    string,
    { start: number; end: number }
  >>({});

  const onGridPointerDown = (dayIndex: number, e: ReactPointerEvent) => {
    // Ignore if starting on an event block
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const top = el.getBoundingClientRect().top;
    const mins = yToMins(e.clientY, top);
    dragMode.current = 'create';
    suppressClick.current = false;
    setDraft({ dayIndex, startMins: mins, endMins: mins + 60 });
  };

  const onGridPointerMove = (dayIndex: number, e: ReactPointerEvent) => {
    if (dragMode.current === 'none') return;
    const el = gridEls.current[dayIndex];
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const mins = yToMins(e.clientY, top);

    if (dragMode.current === 'create' && draft && draft.dayIndex === dayIndex) {
      if (Math.abs(mins - draft.startMins) >= SNAP_MIN) suppressClick.current = true;
      setDraft({ ...draft, endMins: mins });
      return;
    }

    if (dragMode.current === 'move' && dragEv.current) {
      suppressClick.current = true;
      const ev = dragEv.current;
      // Resolve day column under pointer (allows cross-day moves in week view)
      let di = dayIndex;
      for (let i = 0; i < gridEls.current.length; i++) {
        const cell = gridEls.current[i];
        if (!cell) continue;
        const r = cell.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          di = i;
          break;
        }
      }
      const day = days[di] || days[dayIndex];
      const cell = gridEls.current[di] || gridEls.current[dayIndex];
      const top = cell?.getBoundingClientRect().top ?? e.clientY;
      const minsHere = yToMins(e.clientY, top);
      let startMins = minsHere - moveOffsetMins.current;
      startMins = snapMins(Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - SNAP_MIN, startMins)));
      const dur = moveDurationMins.current;
      let endMins = startMins + dur;
      if (endMins > HOUR_END * 60) {
        endMins = HOUR_END * 60;
        startMins = Math.max(HOUR_START * 60, endMins - dur);
      }
      const s = new Date(day);
      s.setHours(0, 0, 0, 0);
      s.setMinutes(startMins);
      const en = new Date(day);
      en.setHours(0, 0, 0, 0);
      en.setMinutes(endMins);
      resizeDraft.current = { start: s, end: en };
      setResizePreview((prev) => ({
        ...prev,
        [ev.id]: { start: s.getTime(), end: en.getTime() },
      }));
      return;
    }

    if (
      (dragMode.current === 'resize-start' || dragMode.current === 'resize-end') &&
      dragEv.current
    ) {
      suppressClick.current = true;
      const ev = dragEv.current;
      const baseStart = resizeDraft.current?.start ?? new Date(ev.instanceStart);
      const baseEnd = resizeDraft.current?.end ?? new Date(ev.instanceEnd);
      const day = days[dayIndex];
      const next = new Date(day);
      next.setHours(0, 0, 0, 0);
      next.setMinutes(mins);
      let s = baseStart;
      let en = baseEnd;
      if (dragMode.current === 'resize-end') {
        if (next.getTime() > s.getTime() + SNAP_MIN * 60_000) en = next;
      } else {
        if (en.getTime() > next.getTime() + SNAP_MIN * 60_000) s = next;
      }
      resizeDraft.current = { start: s, end: en };
      setResizePreview((prev) => ({
        ...prev,
        [ev.id]: { start: s.getTime(), end: en.getTime() },
      }));
    }
  };

  const onGridPointerUp = (dayIndex: number, e: ReactPointerEvent) => {
    const mode = dragMode.current;
    dragMode.current = 'none';
    const el = gridEls.current[dayIndex];
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (mode === 'create' && draft && draft.dayIndex === dayIndex) {
      const a = Math.min(draft.startMins, draft.endMins);
      const b = Math.max(draft.startMins, draft.endMins);
      const end = b - a < SNAP_MIN ? a + 60 : b;
      setDraft(null);
      if (suppressClick.current || end - a >= 30) {
        onCreateRange(days[dayIndex], a, end);
      } else {
        // Treat as click → 1 hour slot
        onSlotClick(days[dayIndex], Math.floor(a / 60));
      }
      return;
    }

    if (
      (mode === 'resize-start' || mode === 'resize-end' || mode === 'move') &&
      dragEv.current &&
      resizeDraft.current
    ) {
      onResizeEvent(dragEv.current, resizeDraft.current.start, resizeDraft.current.end);
    }
    setDraft(null);
    setResizePreview({});
    dragEv.current = null;
    resizeDraft.current = null;
  };

  const startResize = (
    ev: ExpandedEvent,
    edge: 'start' | 'end',
    dayIndex: number,
    e: ReactPointerEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragMode.current = edge === 'start' ? 'resize-start' : 'resize-end';
    dragEv.current = ev;
    resizeDraft.current = {
      start: new Date(ev.instanceStart),
      end: new Date(ev.instanceEnd),
    };
    suppressClick.current = true;
  };

  const startMove = (ev: ExpandedEvent, dayIndex: number, e: ReactPointerEvent) => {
    // Don't start move from resize handles
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    e.stopPropagation();
    e.preventDefault();
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const top = el.getBoundingClientRect().top;
    const pointerMins = yToMins(e.clientY, top);
    const s = new Date(ev.instanceStart);
    const en = new Date(ev.instanceEnd);
    const startMins = s.getHours() * 60 + s.getMinutes();
    const endMins = en.getHours() * 60 + en.getMinutes();
    dragMode.current = 'move';
    dragEv.current = ev;
    moveOffsetMins.current = pointerMins - startMins;
    moveDurationMins.current = Math.max(SNAP_MIN, endMins - startMins);
    resizeDraft.current = { start: s, end: en };
    suppressClick.current = false; // only suppress after actual movement
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto -mx-0 touch-pan-x">
        <div
          className="min-w-full"
          style={{
            minWidth: days.length > 1 ? days.length * colMinPx + 52 : undefined,
          }}
        >
          {/* Day headers */}
          {showDayHeaders && (
            <div
              className="grid border-b border-border sticky top-0 bg-surface z-10"
              style={{
                gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
              }}
            >
              <div />
              {days.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'text-center py-2.5 text-sm font-semibold min-w-0',
                      isToday ? 'text-accent' : 'text-muted',
                    )}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div
                      className={cn(
                        'inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-bold',
                        isToday && 'bg-accent text-accent-ink',
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* All-day strip */}
          <div
            className="grid border-b border-border bg-surface-2/40"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
            }}
          >
            <div className="text-xs text-muted p-1.5 text-right pr-2 pt-2 leading-tight font-medium">
              All
              <br />
              day
            </div>
            {days.map((day, di) => (
              <div
                key={day.toISOString()}
                className="min-h-[2.25rem] p-0.5 space-y-0.5 border-l border-border"
              >
                {allDayByDay[di].map((ev) => {
                  const ids = eventMemberIds(ev);
                                    return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onEventClick(ev)}
                      className="w-full text-left text-sm truncate px-2 py-1.5 rounded-md min-h-[32px] font-medium"
                      style={{
                        ...eventChipStyle(ev, memberColor, { alpha: '48' }),
                      }}
                      title={ev.title}
                    >
                      <span className="inline-flex items-center gap-1 max-w-full">
                        <MemberFaces ids={ids} getMember={getMember} />
                        <span className="truncate">{eventTitleLabel(ev)}</span>
                      </span>
                    </button>
                  );
                })}
                {tasksOnDay(day).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleTodo(t.id)}
                    className="w-full text-left text-sm truncate px-2 py-1.5 rounded-md flex items-center gap-1 border border-dashed border-warn/50 bg-warn-tint text-warn min-h-[32px] font-medium"
                    title={`Task: ${t.text}${taskExtra(t)} (tap to complete)`}
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.text}{taskExtra(t)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Timed grid */}
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
              height: gridHeight,
            }}
          >
            <div className="relative select-none">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-0 text-xs text-muted pr-1.5 -translate-y-1/2 font-medium"
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, h), 'h a')}
                </div>
              ))}
            </div>

            {days.map((day, di) => {
              const pack = packs[di];
              const list = timedByDay[di];
              const isDraftHere = draft?.dayIndex === di;
              return (
                <div
                  key={day.toISOString()}
                  ref={(el) => {
                    gridEls.current[di] = el;
                  }}
                  className="relative border-l border-border touch-none select-none"
                  style={{ height: gridHeight }}
                  onPointerDown={(e) => onGridPointerDown(di, e)}
                  onPointerMove={(e) => onGridPointerMove(di, e)}
                  onPointerUp={(e) => onGridPointerUp(di, e)}
                  onPointerCancel={() => {
                    dragMode.current = 'none';
                    setDraft(null);
                    dragEv.current = null;
                  }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/60 pointer-events-none"
                      style={{ top: (h - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Drag-create preview */}
                  {isDraftHere && draft && (
                    <div
                      className="absolute left-1 right-1 rounded-md bg-accent/30 border border-accent/50 pointer-events-none z-[2]"
                      style={{
                        top:
                          ((Math.min(draft.startMins, draft.endMins) - HOUR_START * 60) / 60) *
                          HOUR_HEIGHT,
                        height: Math.max(
                          8,
                          (Math.abs(draft.endMins - draft.startMins) / 60) * HOUR_HEIGHT,
                        ),
                      }}
                    />
                  )}

                  {list.map((ev) => {
                    const preview = resizePreview[ev.id];
                    const s = new Date(preview?.start ?? ev.instanceStart);
                    const e = new Date(preview?.end ?? ev.instanceEnd);
                    const startMin = s.getHours() * 60 + s.getMinutes();
                    const endMin = e.getHours() * 60 + e.getMinutes();
                    const gridStart = HOUR_START * 60;
                    const gridEnd = HOUR_END * 60;
                    const clampedStart = Math.max(startMin, gridStart);
                    const clampedEnd = Math.min(endMin, gridEnd);
                    if (clampedEnd <= clampedStart) return null;
                    const top = ((clampedStart - gridStart) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      22,
                      ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2,
                    );
                    const layout = pack.get(ev.id) || { column: 0, columnCount: 1 };
                    const widthPct = 100 / layout.columnCount;
                    const leftPct = layout.column * widthPct;
                    const ids = eventMemberIds(ev);
                                        return (
                      <div
                        key={ev.id}
                        data-event-block
                        className="absolute z-[1] text-left text-sm rounded-md overflow-hidden border border-black/10 group cursor-grab active:cursor-grabbing"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          ...eventChipStyle(ev, memberColor, { alpha: '60' }),
                        }}
                        onPointerDown={(pe) => startMove(ev, di, pe)}
                      >
                        {/* Resize handles */}
                        <div
                          data-resize-handle
                          className="absolute left-0 right-0 top-0 h-3 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/15 to-transparent z-[2]"
                          onPointerDown={(pe) => startResize(ev, 'start', di, pe)}
                          title="Drag to change start"
                        />
                        <button
                          type="button"
                          className="w-full h-full text-left px-1.5 py-1 overflow-hidden pointer-events-none"
                          title={`${format(s, 'H:mm')}–${format(e, 'H:mm')} ${ev.title}`}
                        >
                          <div className="font-semibold truncate leading-snug text-sm flex items-center gap-1">
                            <MemberFaces ids={ids} getMember={getMember} />
                            <span className="truncate">
                              {eventTitleLabel(ev)}
                            </span>
                          </div>
                          {height > 30 && (
                            <div className="text-[11px] opacity-90 truncate font-medium">
                              {format(s, 'H:mm')}–{format(e, 'H:mm')}
                            </div>
                          )}
                        </button>
                        {/* Click target: open edit if we didn't actually drag */}
                        <div
                          className="absolute inset-0 z-[1]"
                          onClick={(ce) => {
                            ce.stopPropagation();
                            if (suppressClick.current) {
                              suppressClick.current = false;
                              return;
                            }
                            onEventClick(ev);
                          }}
                        />
                        <div
                          data-resize-handle
                          className="absolute left-0 right-0 bottom-0 h-3 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 sm:opacity-70 bg-gradient-to-t from-black/15 to-transparent z-[2]"
                          onPointerDown={(pe) => startResize(ev, 'end', di, pe)}
                          title="Drag to change end"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-faint text-center py-2 px-2 border-t border-border">
        Drag events to move · edges to resize · empty grid to create
      </p>
    </Card>
  );
}
