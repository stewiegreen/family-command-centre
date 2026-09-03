import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Lock,
  Users,
  UserRound,
  Pencil,
  Trash2,
  Check,
  X,
  Flame,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import {
  cloudCreateJournalEntry,
  cloudUpdateJournalEntry,
  cloudDeleteJournalEntry,
  subscribeJournalEntries,
} from '../lib/firebase';
import type { JournalEntry, JournalVisibility } from '../types';
import { cn } from '../lib/cn';
import { uid } from '../lib/uid';

const MOODS = ['😊', '😌', '😐', '😔', '😤', '🤩', '😴', '🙏'] as const;

const PROMPTS = [
  'What made you smile today?',
  'Something you’re grateful for right now…',
  'What was hard today, and how did you handle it?',
  'Who helped you this week?',
  'What are you looking forward to?',
  'A small win from today…',
  'What would you tell yesterday-you?',
  'What did you learn about yourself lately?',
  'Describe a moment you felt proud.',
  'What do you want more of in your days?',
  'If today had a title, what would it be?',
  'What’s one kindness you noticed?',
];

function promptOfDay(): { id: string; text: string } {
  const day =
    Math.floor(Date.now() / 86_400_000) % PROMPTS.length;
  return { id: `p${day}`, text: PROMPTS[day]! };
}

function visibilityMeta(v: JournalVisibility): {
  label: string;
  icon: typeof Lock;
  className: string;
} {
  if (v === 'family')
    return {
      label: 'Everyone',
      icon: Users,
      className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
    };
  if (v === 'parents')
    return {
      label: 'Parents',
      icon: UserRound,
      className: 'text-sky-600 bg-sky-500/10 border-sky-500/25',
    };
  return {
    label: 'Private',
    icon: Lock,
    className: 'text-muted bg-surface-2 border-border',
  };
}

/** Consecutive calendar days (local) ending today or yesterday with ≥1 entry. */
function computeStreak(entries: JournalEntry[], authorId: string): number {
  const days = new Set<string>();
  for (const e of entries) {
    if (e.authorId !== authorId) continue;
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.add(key);
  }
  if (days.size === 0) return 0;
  const keyFor = (dt: Date) =>
    `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  // Allow streak to still count if last entry was yesterday
  if (!days.has(keyFor(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(keyFor(cursor))) return 0;
  }
  while (days.has(keyFor(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function JournalPage() {
  const {
    currentUser,
    getMember,
    isParent,
    familyId,
    authUser,
    cloudReady,
  } = useApp();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [subError, setSubError] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | undefined>(undefined);
  const [visibility, setVisibility] = useState<JournalVisibility>('private');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editMood, setEditMood] = useState<string | undefined>();
  const [editVis, setEditVis] = useState<JournalVisibility>('private');

  const myId = currentUser?.id || '';
  const myUid = authUser?.uid || '';
  const hasOwnAuth = !!(currentUser?.uid && currentUser.uid === authUser?.uid);
  const prompt = useMemo(() => promptOfDay(), []);

  useEffect(() => {
    if (!familyId || !myUid || !cloudReady) {
      setEntries([]);
      return;
    }
    setSubError(null);
    return subscribeJournalEntries(
      familyId,
      myUid,
      isParent,
      (list) => setEntries(list),
      (err) => setSubError(err.message || 'Could not load journal'),
    );
  }, [familyId, myUid, isParent, cloudReady]);

  const mine = useMemo(
    () => entries.filter((e) => e.authorId === myId || e.authorUid === myUid),
    [entries, myId, myUid],
  );
  const sharedWithMe = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.authorId !== myId &&
          e.authorUid !== myUid &&
          (e.visibility === 'family' || (e.visibility === 'parents' && isParent)),
      ),
    [entries, myId, myUid, isParent],
  );

  const streak = useMemo(() => computeStreak(mine, myId), [mine, myId]);

  const publish = async () => {
    if (!text.trim() || !currentUser || !myUid || !familyId) return;
    if (visibility === 'family') {
      const ok = window.confirm(
        'This will be visible to your whole family — share it?',
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await cloudCreateJournalEntry(familyId, {
        id: uid(),
        authorId: currentUser.id,
        authorUid: myUid,
        visibility,
        text: text.trim(),
        mood: mood || undefined,
        promptId: prompt.id,
        createdAt: now,
        updatedAt: now,
      });
      setText('');
      setMood(undefined);
      setVisibility('private');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save entry');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (e: JournalEntry) => {
    setEditId(e.id);
    setEditText(e.text);
    setEditMood(e.mood);
    setEditVis(e.visibility);
  };

  const saveEdit = async () => {
    if (!editId || !editText.trim() || !familyId) return;
    if (editVis === 'family') {
      const existing = entries.find((x) => x.id === editId);
      if (existing && existing.visibility !== 'family') {
        const ok = window.confirm(
          'This will be visible to your whole family — share it?',
        );
        if (!ok) return;
      }
    }
    try {
      await cloudUpdateJournalEntry(familyId, editId, {
        text: editText.trim(),
        mood: editMood || undefined,
        visibility: editVis,
        updatedAt: new Date().toISOString(),
      });
      setEditId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not update entry');
    }
  };

  const remove = async (id: string) => {
    if (!familyId) return;
    if (!window.confirm('Delete this journal entry?')) return;
    try {
      await cloudDeleteJournalEntry(familyId, id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  const changeVisibility = async (e: JournalEntry, next: JournalVisibility) => {
    if (!familyId) return;
    if (next === 'family' && e.visibility !== 'family') {
      const ok = window.confirm(
        'This will be visible to your whole family — share it?',
      );
      if (!ok) return;
    }
    try {
      await cloudUpdateJournalEntry(familyId, e.id, {
        visibility: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update sharing');
    }
  };

  const VisBadge = ({ v }: { v: JournalVisibility }) => {
    const meta = visibilityMeta(v);
    const Icon = meta.icon;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border',
          meta.className,
        )}
      >
        <Icon className="w-3 h-3" />
        {meta.label}
      </span>
    );
  };

  const list = tab === 'mine' ? mine : sharedWithMe;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-accent" />
            Journal
          </h1>
          <p className="text-sm text-muted mt-1">
            Your private space to reflect — share only when you choose.
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
            <Flame className="w-4 h-4" />
            {streak}-day streak
          </div>
        )}
      </div>

      {!hasOwnAuth && currentUser && (
        <Card className="!p-3 border-amber-500/30 bg-amber-500/5">
          <p className="text-xs text-muted leading-relaxed">
            <span className="font-semibold text-fg">About Private: </span>
            This profile is unlocked with a PIN under a shared login. Private
            entries are hidden in the app from other profiles, but full
            database-level privacy needs your own account. Ask a parent about
            setting one up if that matters to you.
          </p>
        </Card>
      )}

      {/* Composer */}
      <Card className="!p-4 space-y-3">
        <p className="text-sm text-muted italic">{prompt.text}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a few lines…"
          rows={4}
          maxLength={5000}
          className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent resize-y min-h-[6rem]"
        />
        <div>
          <p className="text-[11px] text-muted mb-1.5">Mood (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood((cur) => (cur === m ? undefined : m))}
                className={cn(
                  'w-9 h-9 rounded-xl text-lg border transition-colors',
                  mood === m
                    ? 'border-accent bg-accent/15'
                    : 'border-border bg-inset hover:bg-nav-hover',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1.5">Who can see this</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['private', 'Private'],
                ['parents', 'Parents'],
                ['family', 'Everyone'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVisibility(id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm border transition-colors',
                  visibility === id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-strong text-muted hover:bg-nav-hover',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void publish()} disabled={!text.trim() || saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium',
            tab === 'mine' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg',
          )}
        >
          My entries ({mine.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('shared')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium',
            tab === 'shared' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg',
          )}
        >
          Shared with me ({sharedWithMe.length})
        </button>
      </div>

      {subError && (
        <p className="text-sm text-red-500">{subError}</p>
      )}

      {list.length === 0 ? (
        <Card className="!p-8 text-center text-sm text-muted">
          {tab === 'mine'
            ? 'No entries yet — write your first one above.'
            : 'Nothing shared with you yet.'}
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((e) => {
            const author = getMember(e.authorId);
            const isMine = e.authorId === myId || e.authorUid === myUid;
            const editing = editId === e.id;

            return (
              <Card key={e.id} className="!p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {author && <Avatar {...author} size="sm" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg truncate">
                        {isMine ? 'You' : author?.name || 'Family member'}
                        {e.mood ? ` · ${e.mood}` : ''}
                      </p>
                      <p className="text-[11px] text-faint">
                        {new Date(e.createdAt).toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <VisBadge v={e.visibility} />
                </div>

                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(ev) => setEditText(ev.target.value)}
                      rows={4}
                      maxLength={5000}
                      className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {MOODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setEditMood((cur) => (cur === m ? undefined : m))
                          }
                          className={cn(
                            'w-8 h-8 rounded-lg text-base border',
                            editMood === m
                              ? 'border-accent bg-accent/15'
                              : 'border-border',
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['private', 'Private'],
                          ['parents', 'Parents'],
                          ['family', 'Everyone'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditVis(id)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs border',
                            editVis === id
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-border text-muted',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                        <X className="w-4 h-4" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => void saveEdit()}>
                        <Check className="w-4 h-4" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-fg whitespace-pre-wrap">{e.text}</p>
                    {isMine && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              ['private', 'Private'],
                              ['parents', 'Parents'],
                              ['family', 'Everyone'],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => void changeVisibility(e, id)}
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] border',
                                e.visibility === id
                                  ? 'border-accent bg-accent/15 text-accent'
                                  : 'border-border text-faint hover:text-fg',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => startEdit(e)}
                          className="p-1.5 text-faint hover:text-accent"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(e.id)}
                          className="p-1.5 text-faint hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
