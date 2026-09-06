import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Square, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { formatCountdown, playTimeUpBeep, unlockTimerAudio } from '../lib/screenTimer';

import type { ScreenTimeAlert, ScreenTimerSession } from '../types';
import { cn } from '../lib/cn';

const PRESETS = [15, 30, 45, 60];

export function ScreenTimerCard() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser || data.members.find((m) => m.id === data.settings.currentUserId);
  const myId = me?.id || '';
  const kids = data.members.filter((m) => m.role === 'kid');
  const screenTime = data.screenTime || {};
  const timers = data.screenTimers || {};

  const [targetId, setTargetId] = useState(() => {
    if (me?.role === 'kid') return me.id;
    return kids[0]?.id || '';
  });
  const [mins, setMins] = useState(30);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(Date.now());
  const expiredHandled = useRef<Set<string>>(new Set());

  // Tick every second while any relevant timer runs
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeForTarget = timers[targetId];
  const myActive = me?.role === 'kid' ? timers[myId] : activeForTarget;

  const remainingSec = useMemo(() => {
    if (!myActive) return 0;
    return Math.max(0, Math.ceil((new Date(myActive.endsAt).getTime() - now) / 1000));
  }, [myActive, now]);

  // Expire handlers — debit already taken at start; fire alert + beep
  useEffect(() => {
    const entries = Object.entries(timers);
    for (const [memberId, sess] of entries) {
      const end = new Date(sess.endsAt).getTime();
      if (end > Date.now()) continue;
      const key = `${memberId}:${sess.startedAt}`;
      if (expiredHandled.current.has(key)) continue;
      expiredHandled.current.add(key);

      playTimeUpBeep();
      const member = getMember(memberId);
      const name = member?.name || 'Someone';
      const alert: ScreenTimeAlert = {
        id: crypto.randomUUID(),
        memberId,
        memberName: name,
        message: `${name}'s screen time is up${sess.label ? ` (${sess.label})` : ''}`,
        at: new Date().toISOString(),
      };
      update((d) => {
        const nextTimers = { ...(d.screenTimers || {}) };
        delete nextTimers[memberId];
        return {
          ...d,
          screenTimers: nextTimers,
          screenTimeAlerts: [alert, ...(d.screenTimeAlerts || [])].slice(0, 30),
        };
      });
    }
  }, [now, timers, getMember, update]);

  const bal = screenTime[targetId] ?? 0;
  const canStart = targetId && mins > 0 && bal >= mins && !timers[targetId];

  const startTimer = () => {
    if (!canStart || !myId) return;
    void unlockTimerAudio();
    const m = Math.floor(mins);
    if (m <= 0 || bal < m) {
      alert(`Only ${bal} minutes available.`);
      return;
    }
    const startedAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + m * 60_000).toISOString();
    const session: ScreenTimerSession = {
      memberId: targetId,
      byId: myId,
      startedAt,
      endsAt,
      totalMin: m,
      label: label.trim() || undefined,
    };
    update((d) => {
      const current = (d.screenTime || {})[targetId] ?? 0;
      if (current < m) return d;
      return {
        ...d,
        screenTime: { ...(d.screenTime || {}), [targetId]: current - m },
        screenTimeLog: [
          {
            id: crypto.randomUUID(),
            memberId: targetId,
            delta: -m,
            reason: `Timer: ${label.trim() || 'screen time'} (${m}m)`,
            byId: myId,
            at: startedAt,
          },
          ...(d.screenTimeLog || []),
        ].slice(0, 100),
        screenTimers: { ...(d.screenTimers || {}), [targetId]: session },
      };
    });
  };

  const stopEarly = (memberId: string) => {
    const sess = timers[memberId];
    if (!sess) return;
    const leftSec = Math.max(0, new Date(sess.endsAt).getTime() - Date.now());
    const refund = Math.floor(leftSec / 60_000); // whole unused minutes
    if (!confirm(refund > 0 ? `Stop timer and refund ${refund} unused minute(s)?` : 'Stop timer?')) {
      return;
    }
    update((d) => {
      const nextTimers = { ...(d.screenTimers || {}) };
      delete nextTimers[memberId];
      const st = { ...(d.screenTime || {}) };
      let log = d.screenTimeLog || [];
      if (refund > 0) {
        st[memberId] = (st[memberId] ?? 0) + refund;
        log = [
          {
            id: crypto.randomUUID(),
            memberId,
            delta: refund,
            reason: `Timer stopped early — refund ${refund}m`,
            byId: myId,
            at: new Date().toISOString(),
          },
          ...log,
        ].slice(0, 100);
      }
      return { ...d, screenTimers: nextTimers, screenTime: st, screenTimeLog: log };
    });
  };

  // Kid sees only self; parent picks kid
  useEffect(() => {
    if (me?.role === 'kid' && me.id) setTargetId(me.id);
  }, [me?.id, me?.role]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-fg flex items-center gap-2">
          <Timer className="w-4 h-4 text-accent" />
          Screen timer
        </h3>
        <span className="text-xs text-muted tabular-nums">{bal}m bank</span>
      </div>
      <p className="text-[11px] text-faint">
        For Nintendo, YouTube, TV — not Emby (that meters itself). Starts by spending minutes from
        the bank; unused time is refunded if you stop early.
      </p>

      {isParent && kids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setTargetId(k.id)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs border',
                targetId === k.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted hover:text-fg',
              )}
            >
              {k.emoji || '👤'} {k.name}
              {timers[k.id] ? ' · ⏱' : ''}
            </button>
          ))}
        </div>
      )}

      {myActive ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center space-y-2">
          <p className="text-xs text-muted">
            {myActive.label || 'Screen time'} · {getMember(myActive.memberId)?.name || ''}
          </p>
          <p
            className={cn(
              'text-4xl font-bold tabular-nums tracking-tight',
              remainingSec <= 60 ? 'text-warn' : 'text-fg',
            )}
          >
            {formatCountdown(remainingSec)}
          </p>
          <p className="text-[11px] text-faint">
            Ends {new Date(myActive.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
          <Button size="sm" variant="secondary" onClick={() => stopEarly(myActive.memberId)}>
            <Square className="w-3.5 h-3.5" /> Stop
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={p > bal}
                onClick={() => setMins(p)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs border tabular-nums',
                  mins === p
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border text-muted hover:text-fg',
                  p > bal && 'opacity-40 cursor-not-allowed',
                )}
              >
                {p}m
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={bal || 1}
              value={mins}
              onChange={(e) => setMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-24"
            />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What? (Nintendo…)"
              className="flex-1"
            />
          </div>
          <Button size="sm" disabled={!canStart} onClick={startTimer} className="w-full">
            <Play className="w-3.5 h-3.5" /> Start · spend {Math.floor(mins)}m
          </Button>
          {bal <= 0 && (
            <p className="text-xs text-warn">No minutes in the bank — earn some in ChoreQuest first.</p>
          )}
        </div>
      )}

      {/* Other kids' running timers (parent view) */}
      {isParent &&
        Object.values(timers)
          .filter((s) => s.memberId !== targetId)
          .map((s) => {
            const sec = Math.max(0, Math.ceil((new Date(s.endsAt).getTime() - now) / 1000));
            return (
              <div
                key={s.memberId}
                className="flex items-center justify-between text-xs text-muted border border-border rounded-xl px-3 py-2"
              >
                <span>
                  {getMember(s.memberId)?.name} · {s.label || 'timer'} · {formatCountdown(sec)}
                </span>
                <button type="button" className="text-accent" onClick={() => stopEarly(s.memberId)}>
                  Stop
                </button>
              </div>
            );
          })}
    </div>
  );
}
