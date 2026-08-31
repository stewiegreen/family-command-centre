import { useEffect, useMemo, useState } from 'react';
import { Plus, Pin, Search, StickyNote, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';

export function NotesPage() {
  const { data, update } = useApp();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', content: '', tags: '', pinned: false });

  useEffect(() => {
    const h = () => {
      setForm({ title: '', content: '', tags: '', pinned: false });
      setEditId(null);
      setShowForm(true);
    };
    window.addEventListener('fcc:quick-add', h);
    return () => window.removeEventListener('fcc:quick-add', h);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.notes
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [data.notes, search]);

  const save = () => {
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (editId) {
      update((d) => ({
        ...d,
        notes: d.notes.map((n) =>
          n.id === editId
            ? {
                ...n,
                title: form.title || 'Untitled',
                content: form.content,
                tags,
                pinned: form.pinned,
                updatedAt: new Date().toISOString(),
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
            title: form.title || 'Untitled',
            content: form.content,
            tags,
            pinned: form.pinned,
            authorId: d.settings.currentUserId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...d.notes,
        ],
      }));
    }
    setShowForm(false);
  };

  const openEdit = (id: string) => {
    const n = data.notes.find((x) => x.id === id);
    if (!n) return;
    setEditId(id);
    setForm({ title: n.title, content: n.content, tags: n.tags.join(', '), pinned: n.pinned });
    setShowForm(true);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Notes</h1>
        <Button
          size="sm"
          onClick={() => {
            setEditId(null);
            setForm({ title: '', content: '', tags: '', pinned: false });
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" /> New
        </Button>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…" className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes" description="Pin announcements or jot family notes." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((n) => {
            const author = data.members.find((m) => m.id === n.authorId);
            return (
              <Card key={n.id} className="!p-4 space-y-2" onClick={() => openEdit(n.id)}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm line-clamp-1">{n.title}</h3>
                  {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-muted line-clamp-3 whitespace-pre-wrap">{n.content}</p>
                <div className="flex items-center justify-between pt-1">
                  {author && (
                    <div className="flex items-center gap-1.5">
                      <Avatar {...author} size="sm" className="!w-6 !h-6 !text-sm" />
                      <span className="text-[10px] text-muted">{author.name}</span>
                    </div>
                  )}
                  <div className="flex gap-1 flex-wrap justify-end">
                    {n.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit note' : 'New note'} wide>
        <div className="space-y-3">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title" />
          <Textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write something…"
            rows={6}
          />
          <Input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="Tags (comma-separated)"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
            Pin to top
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save}>
              Save
            </Button>
            {editId && (
              <Button
                variant="danger"
                onClick={() => {
                  update((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== editId) }));
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
