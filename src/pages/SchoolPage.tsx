import { useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, GraduationCap, Plus, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { uid } from '../lib/uid';
import {
  approveStudyBlock,
  blocksForKidDate,
  completeStudyBlock,
  ensureStudyConfig,
  ensureStudySubjects,
  localDateStr,
  removeBlockCalendar,
  reopenStudyBlock,
  upsertBlockCalendar,
} from '../lib/school';
import type { StudyBlock } from '../types';

type FormState = {
  title: string;
  subjectId: string;
  kidId: string;
  date: string;
  startTime: string;
  endTime: string;
  minutes: string;
  xp: string;
  coins: string;
  requiresApproval: boolean;
  notes: string;
};

function emptyForm(kidId: string, date: string): FormState {
  return {
    title: '',
    subjectId: 'math',
    kidId,
    date,
    startTime: '10:00',
    endTime: '10:40',
    minutes: '40',
    xp: '20',
    coins: '5',
    requiresApproval: false,
    notes: '',
  };
}

export function SchoolPage() {
  const { data, update, currentUser, getMember, isParent } = useApp();
  const kids = useMemo(
    () => data.members.filter((m) => m.role === 'kid'),
    [data.members],
  );
  const subjects = ensureStudySubjects(data.studySubjects);
  const cfg = ensureStudyConfig(data.studyConfig);

  const defaultKid =
    currentUser?.role === 'kid' ? currentUser.id : kids[0]?.id || '';
  const [kidId, setKidId] = useState(defaultKid);
  const [date, setDate] = useState(localDateStr());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultKid, localDateStr()));
  const [msg, setMsg] = useState('');

  // Kid locked to self
  const effectiveKidId = currentUser?.role === 'kid' ? currentUser.id : kidId;
  const blocks = blocksForKidDate(data, effectiveKidId, date);
  const doneCount = blocks.filter((b) => b.status === 'done').length;
  const allDone = blocks.length > 0 && doneCount === blocks.length;
  const pending = (data.studyBlocks || []).filter((b) => b.status === 'pending');

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(effectiveKidId || defaultKid, date));
    setShowForm(true);
  };

  const openEdit = (b: StudyBlock) => {
    if (!isParent) return;
    setEditingId(b.id);
    setForm({
      title: b.title,
      subjectId: b.subjectId || 'other',
      kidId: b.kidId,
      date: b.date,
      startTime: b.startTime || '10:00',
      endTime: b.endTime || '11:00',
      minutes: b.minutes != null ? String(b.minutes) : '',
      xp: String(b.xp),
      coins: String(b.coins),
      requiresApproval: !!b.requiresApproval,
      notes: b.notes || '',
    });
    setShowForm(true);
  };

  const saveBlock = () => {
    if (!isParent || !currentUser) return;
    const title = form.title.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const block: StudyBlock = {
      id: editingId || uid(),
      kidId: form.kidId,
      date: form.date,
      title,
      subjectId: form.subjectId || undefined,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      minutes: form.minutes ? Math.max(0, parseInt(form.minutes, 10) || 0) : undefined,
      xp: Math.max(0, parseInt(form.xp, 10) || 0),
      coins: Math.max(0, parseInt(form.coins, 10) || 0),
      status: 'open',
      requiresApproval: form.requiresApproval,
      notes: form.notes.trim() || undefined,
      createdById: currentUser.id,
      createdAt: now,
      updatedAt: now,
      calendarEventId: editingId
        ? data.studyBlocks?.find((b) => b.id === editingId)?.calendarEventId
        : undefined,
    };
    // Preserve status if editing existing
    if (editingId) {
      const prev = data.studyBlocks?.find((b) => b.id === editingId);
      if (prev) {
        block.status = prev.status;
        block.submittedAt = prev.submittedAt;
        block.submittedById = prev.submittedById;
        block.approvedAt = prev.approvedAt;
        block.approvedById = prev.approvedById;
        block.createdAt = prev.createdAt;
        block.createdById = prev.createdById;
      }
    }
    update((d) => {
      let next: typeof d = { ...d, studySubjects: ensureStudySubjects(d.studySubjects) };
      const without = (next.studyBlocks || []).filter((b) => b.id !== block.id);
      next = { ...next, studyBlocks: [...without, block] };
      next = upsertBlockCalendar(next, block, ensureStudySubjects(next.studySubjects));
      return next;
    });
    setShowForm(false);
    setMsg('Saved');
  };

  const deleteBlock = (b: StudyBlock) => {
    if (!isParent) return;
    if (!confirm(`Delete “${b.title}”?`)) return;
    update((d) => removeBlockCalendar(d, b));
  };

  const onDone = (b: StudyBlock) => {
    if (!currentUser) return;
    update((d) => completeStudyBlock(d, b.id, currentUser.id));
    setMsg(b.requiresApproval ? 'Submitted for approval' : 'Done — rewards added!');
  };

  const onApprove = (b: StudyBlock) => {
    if (!currentUser || !isParent) return;
    update((d) => approveStudyBlock(d, b.id, currentUser.id));
    setMsg('Approved');
  };

  const onReopen = (b: StudyBlock) => {
    if (!isParent) return;
    update((d) => reopenStudyBlock(d, b.id));
  };

  const shiftDate = (delta: number) => {
    const d = parseISO(date + 'T12:00:00');
    setDate(localDateStr(addDays(d, delta)));
  };

  const subjectOf = (id?: string) => subjects.find((s) => s.id === id);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-accent" />
          <div>
            <h1 className="text-xl font-bold text-fg">School</h1>
            <p className="text-xs text-muted">
              Plan the day · finish blocks · earn XP &amp; treasure
            </p>
          </div>
        </div>
        {isParent && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add block
          </Button>
        )}
      </div>

      {msg && (
        <p className="text-sm text-accent font-medium" onAnimationEnd={() => setMsg('')}>
          {msg}
        </p>
      )}

      {/* Kid + date */}
      <Card className="space-y-3">
        {isParent && kids.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => {
              const look = getMember(k.id) || k;
              const active = effectiveKidId === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKidId(k.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm',
                    active ? 'border-accent bg-accent/15 text-accent' : 'border-border text-fg',
                  )}
                >
                  <Avatar
                    name={look.name}
                    color={look.color}
                    emoji={look.emoji}
                    initials={look.initials}
                    size="sm"
                  />
                  {look.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button size="icon" variant="ghost" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-fg">
              {format(parseISO(date + 'T12:00:00'), 'EEEE, d MMM')}
            </p>
            {date !== localDateStr() && (
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => setDate(localDateStr())}
              >
                Jump to today
              </button>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={() => shiftDate(1)} aria-label="Next day">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        {blocks.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {doneCount}/{blocks.length} done
            </span>
            {allDone && (
              <span className="text-accent font-semibold">
                Day complete
                {(cfg.dayBonusXp || cfg.dayBonusCoins)
                  ? ` · +${cfg.dayBonusXp || 0} XP · +${cfg.dayBonusCoins || 0} coins`
                  : ''}
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Parent pending */}
      {isParent && pending.length > 0 && (
        <Card className="space-y-2 border-accent/40">
          <h2 className="text-sm font-semibold text-fg">Waiting for approval</h2>
          {pending.map((b) => {
            const kid = getMember(b.kidId);
            return (
              <div
                key={b.id}
                className="flex items-center gap-2 justify-between rounded-xl border border-border bg-inset/40 p-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{b.title}</p>
                  <p className="text-xs text-muted">
                    {kid?.name} · {b.date} · +{b.xp} XP · +{b.coins} coins
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => onApprove(b)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onReopen(b)}>
                    Send back
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Blocks */}
      <div className="space-y-2">
        {blocks.length === 0 && (
          <Card className="text-center py-8 text-muted text-sm">
            {isParent
              ? 'No school blocks this day — add one to get started.'
              : 'Nothing scheduled for this day. Enjoy the break!'}
          </Card>
        )}
        {blocks.map((b) => {
          const sub = subjectOf(b.subjectId);
          const timeLabel =
            b.startTime && b.endTime
              ? `${b.startTime}–${b.endTime}`
              : b.startTime
                ? b.startTime
                : b.minutes
                  ? `${b.minutes} min`
                  : '';
          return (
            <Card
              key={b.id}
              className={cn(
                'space-y-2',
                b.status === 'done' && 'opacity-80',
                b.status === 'pending' && 'border-accent/50',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-1.5 self-stretch rounded-full shrink-0"
                  style={{ background: sub?.color || 'var(--app-accent)' }}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-fg leading-snug">{b.title}</p>
                      <p className="text-xs text-muted">
                        {[sub?.name, timeLabel].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted shrink-0">
                      <div className="text-accent font-semibold">+{b.xp} XP</div>
                      <div>+{b.coins} coins</div>
                    </div>
                  </div>
                  {b.requiresApproval && b.status === 'open' && (
                    <p className="text-[11px] text-muted">Needs parent check before rewards</p>
                  )}
                  {b.status === 'pending' && (
                    <p className="text-[11px] text-accent">Waiting for parent approval</p>
                  )}
                  {b.status === 'done' && (
                    <p className="text-[11px] text-muted flex items-center gap-1">
                      <Check className="w-3 h-3" /> Done
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {b.status === 'open' && (currentUser?.role === 'kid' || isParent) && (
                      <Button size="sm" onClick={() => onDone(b)}>
                        Mark done
                      </Button>
                    )}
                    {isParent && b.status === 'pending' && (
                      <Button size="sm" onClick={() => onApprove(b)}>
                        Approve
                      </Button>
                    )}
                    {isParent && b.status === 'done' && (
                      <Button size="sm" variant="ghost" onClick={() => onReopen(b)}>
                        <RotateCcw className="w-3.5 h-3.5" /> Reopen
                      </Button>
                    )}
                    {isParent && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteBlock(b)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Parent day-bonus settings */}
      {isParent && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">Day complete bonus</h2>
          <p className="text-xs text-muted">
            Granted once when every block that day is done (auto or after approval).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted">Bonus XP</label>
              <Input
                type="number"
                min={0}
                value={cfg.dayBonusXp ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                  update((d) => ({
                    ...d,
                    studyConfig: { ...ensureStudyConfig(d.studyConfig), dayBonusXp: v },
                  }));
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Bonus coins</label>
              <Input
                type="number"
                min={0}
                value={cfg.dayBonusCoins ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                  update((d) => ({
                    ...d,
                    studyConfig: { ...ensureStudyConfig(d.studyConfig), dayBonusCoins: v },
                  }));
                }}
              />
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit school block' : 'New school block'}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted">Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Fractions worksheet p.12"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted">Kid</label>
              <select
                className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm"
                value={form.kidId}
                onChange={(e) => setForm((f) => ({ ...f, kidId: e.target.value }))}
              >
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Subject</label>
              <select
                className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm"
                value={form.subjectId}
                onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
              >
                {subjects.filter((s) => s.active !== false).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted">Date</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted">Start</label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted">End</label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Minutes</label>
              <Input
                type="number"
                min={0}
                value={form.minutes}
                onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted">XP</label>
              <Input
                type="number"
                min={0}
                value={form.xp}
                onChange={(e) => setForm((f) => ({ ...f, xp: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Coins</label>
              <Input
                type="number"
                min={0}
                value={form.coins}
                onChange={(e) => setForm((f) => ({ ...f, coins: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
            />
            Require parent approval before rewards
          </label>
          <div>
            <label className="text-xs text-muted">Notes (optional)</label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Page numbers, links, materials…"
            />
          </div>
          <Button className="w-full" onClick={saveBlock}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
