import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pin,
  Search,
  StickyNote,
  Trash2,
  Home,
  CheckSquare,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import { NOTE_TAG_PRESETS, isNoteStale } from '../lib/noteTags';
import type { Note, NoteChecklistItem, NoteKind } from '../types';
import { cn } from '../lib/cn';

type FormState = {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  showOnHome: boolean;
  kind: NoteKind;
  checklistText: string; // one item per line while editing
};

const emptyForm = (): FormState => ({
  title: '',
  content: '',
  tags: [],
  pinned: false,
  showOnHome: false,
  kind: 'free',
  checklistText: '',
});


export function NotesPage() {
  const { data, update, getMember, currentUser, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    const h = () => {
      setForm(emptyForm());
      setEditId(null);
      setShowForm(true);
    };
    window.addEventListener('fcc:quick-add', h);
    return () => window.removeEventListener('fcc:quick-add', h);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return data.notes
      .filter((n) => {
        if (tagFilter && !n.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) {
          return false;
        }
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          (n.checklist || []).some((c) => c.text.toLowerCase().includes(q))
        );
      })
      .sort(
        (a, b) =>
          Number(!!b.showOnHome) - Number(!!a.showOnHome) ||
          Number(b.pinned) - Number(a.pinned) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data.notes, search, tagFilter]);

  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of data.notes) for (const t of n.tags) if (t.trim()) set.add(t.trim());
    return Array.from(set);
  }, [data.notes]);

  const openCreate = () => {
    setForm(emptyForm());
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (n: Note) => {
    setEditId(n.id);
    setForm({
      title: n.title,
      content: n.content,
      tags: [...n.tags],
      pinned: n.pinned,
      showOnHome: !!n.showOnHome,
      kind: n.kind || 'free',
      checklistText: (n.checklist || []).map((c) => c.text).join('\n'),
    });
    setShowForm(true);
  };

  const toggleTag = (tag: string) => {
    setForm((f) => {
      const has = f.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
      return {
        ...f,
        tags: has
          ? f.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
          : [...f.tags, tag],
      };
    });
  };

  const save = () => {
    const tags = form.tags.map((t) => t.trim()).filter(Boolean);
    const kind: NoteKind = form.kind;
    const showOnHome = isParent ? (kind === 'notice' ? true : form.showOnHome) : false;
    let checklist: NoteChecklistItem[] | undefined;
    if (kind === 'checklist') {
      const lines = form.checklistText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const prev = editId
        ? data.notes.find((n) => n.id === editId)?.checklist || []
        : [];
      checklist = lines.map((text, i) => {
        const existing = prev[i];
        return {
          id: existing?.id || uid(),
          text,
          done: existing?.text === text ? !!existing.done : false,
        };
      });
    }

    const now = new Date().toISOString();
    if (editId) {
      update((d) => ({
        ...d,
        notes: d.notes.map((n) =>
          n.id === editId
            ? {
                ...n,
                title: form.title.trim() || 'Untitled',
                content: kind === 'checklist' ? '' : form.content,
                tags,
                pinned: form.pinned,
                showOnHome: isParent ? showOnHome : n.showOnHome,
                kind: isParent || n.kind !== 'notice' ? kind : n.kind,
                checklist: kind === 'checklist' ? checklist : undefined,
                // Reset read receipts if notice text/title changed materially? keep readBy unless parent clears
                readBy: kind === 'notice' ? n.readBy || [] : undefined,
                updatedAt: now,
              }
            : n,
        ),
      }));
    } else {
      update((d) => ({
        ...d,
        notes: [
          {
            id: uid(),
            title: form.title.trim() || 'Untitled',
            content: kind === 'checklist' ? '' : form.content,
            tags,
            pinned: form.pinned,
            showOnHome,
            kind,
            checklist: kind === 'checklist' ? checklist : undefined,
            readBy: kind === 'notice' ? [] : undefined,
            authorId: myId,
            createdAt: now,
            updatedAt: now,
          },
          ...d.notes,
        ],
      }));
    }
    setShowForm(false);
  };

  const toggleCheckItem = (noteId: string, itemId: string) => {
    update((d) => ({
      ...d,
      notes: d.notes.map((n) => {
        if (n.id !== noteId || !n.checklist) return n;
        return {
          ...n,
          checklist: n.checklist.map((c) =>
            c.id === itemId ? { ...c, done: !c.done } : c,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  const acknowledgeNotice = (noteId: string) => {
    update((d) => ({
      ...d,
      notes: d.notes.map((n) => {
        if (n.id !== noteId) return n;
        const readBy = n.readBy || [];
        if (readBy.includes(myId)) return n;
        return {
          ...n,
          readBy: [...readBy, myId],
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="text-sm text-muted mt-1">
            Shared family reference — facts, checklists, and must-reads. Not a diary.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> New note
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          className="!pl-9"
        />
      </div>

      {/* Tag filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium border',
            !tagFilter
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border text-muted hover:bg-nav-hover',
          )}
        >
          All
        </button>
        {NOTE_TAG_PRESETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium border',
              tagFilter === t
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:bg-nav-hover',
            )}
          >
            {t}
          </button>
        ))}
        {usedTags
          .filter((t) => !(NOTE_TAG_PRESETS as readonly string[]).includes(t))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border',
                tagFilter === t
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted hover:bg-nav-hover',
              )}
            >
              {t}
            </button>
          ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="!p-8">
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            description="Add wifi codes, school info, packing lists, or a must-read for the kids."
            action={
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" /> First note
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((n) => {
            const author = getMember(n.authorId);
            const kind = (n.kind || 'free') as NoteKind;
            const stale = (n.pinned || n.showOnHome) && isNoteStale(n.updatedAt);
            const kids = data.members.filter((m) => m.role === 'kid');
            const readCount = (n.readBy || []).length;

            return (
              <Card
                key={n.id}
                className={cn(
                  '!p-4 space-y-2 cursor-pointer hover:border-border-strong transition-colors',
                  n.showOnHome && 'ring-1 ring-accent/30',
                )}
                onClick={() => openEdit(n)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      {n.showOnHome && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <Home className="w-3 h-3" /> Home
                        </span>
                      )}
                      {kind === 'notice' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                          <Megaphone className="w-3 h-3" /> Must-read
                        </span>
                      )}
                      {kind === 'checklist' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                          <CheckSquare className="w-3 h-3" /> Checklist
                        </span>
                      )}
                      {stale && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Stale
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-fg truncate">{n.title}</h3>
                  </div>
                  {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </div>

                {kind === 'checklist' ? (
                  <ul className="space-y-1" onClick={(e) => e.stopPropagation()}>
                    {(n.checklist || []).slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm text-left w-full"
                          onClick={() => toggleCheckItem(n.id, c.id)}
                        >
                          <span
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0',
                              c.done
                                ? 'bg-accent border-accent text-accent-ink'
                                : 'border-border-strong',
                            )}
                          >
                            {c.done ? '✓' : ''}
                          </span>
                          <span className={cn(c.done && 'line-through text-muted')}>
                            {c.text}
                          </span>
                        </button>
                      </li>
                    ))}
                    {(n.checklist || []).length > 5 && (
                      <li className="text-[11px] text-muted">
                        +{(n.checklist || []).length - 5} more
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs text-muted line-clamp-3 whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}

                {kind === 'notice' && isParent && kids.length > 0 && (
                  <p className="text-[11px] text-muted">
                    Read by {readCount}/{kids.length} kids
                  </p>
                )}

                {kind === 'notice' &&
                  !isParent &&
                  currentUser?.role === 'kid' &&
                  !(n.readBy || []).includes(myId) && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => acknowledgeNotice(n.id)}>
                        I read this
                      </Button>
                    </div>
                  )}

                <div className="flex items-center justify-between pt-1 gap-2">
                  {author && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Avatar {...author} size="sm" className="!w-7 !h-7 !text-sm" />
                      <span className="text-[10px] text-muted truncate">
                        {author.name}
                        {' · '}
                        {new Date(n.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-1 flex-wrap justify-end">
                    {n.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Edit note' : 'New note'}
        wide
      >
        <div className="space-y-3">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            autoFocus
          />

          {isParent && (
            <div>
              <p className="text-xs text-muted mb-1.5">Type</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['free', 'Note'],
                    ['checklist', 'Checklist'],
                    ['notice', 'Must-read'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        kind: id,
                        showOnHome: id === 'notice' ? true : f.showOnHome,
                      }))
                    }
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border',
                      form.kind === id
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-muted hover:bg-nav-hover',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.kind === 'notice' && (
                <p className="text-[11px] text-muted mt-1.5">
                  Stays at the top of each kid&apos;s Home until they tap &quot;I read this&quot;.
                </p>
              )}
            </div>
          )}

          {form.kind === 'checklist' ? (
            <Textarea
              value={form.checklistText}
              onChange={(e) => setForm((f) => ({ ...f, checklistText: e.target.value }))}
              placeholder="One checklist item per line…"
              rows={6}
            />
          ) : (
            <Textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write something…"
              rows={6}
            />
          )}

          <div>
            <p className="text-xs text-muted mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TAG_PRESETS.map((t) => {
                const on = form.tags.some((x) => x.toLowerCase() === t.toLowerCase());
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border',
                      on
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-muted hover:bg-nav-hover',
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
            />
            Pin to top of Notes list
          </label>

          {isParent && form.kind !== 'notice' && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.showOnHome}
                onChange={(e) => setForm((f) => ({ ...f, showOnHome: e.target.checked }))}
              />
              Show on Home (fixed top — kids can&apos;t hide it)
            </label>
          )}
          {isParent && form.kind === 'notice' && (
            <p className="text-xs text-muted flex items-center gap-1">
              <Home className="w-3.5 h-3.5 text-accent" />
              Must-reads always show on Home until each kid acknowledges.
            </p>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={save}>
              Save
            </Button>
            {editId && (
              <Button
                variant="danger"
                onClick={() => {
                  if (!isParent) {
                    const n = data.notes.find((x) => x.id === editId);
                    if (n?.showOnHome || n?.kind === 'notice') {
                      alert('Only a parent can delete Home or must-read notes.');
                      return;
                    }
                  }
                  update((d) => ({
                    ...d,
                    notes: d.notes.filter((n) => n.id !== editId),
                  }));
                  setShowForm(false);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
