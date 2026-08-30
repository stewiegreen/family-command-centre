import { useState } from 'react';
import { Calendar, CheckSquare, Plus, RefreshCw, ShoppingCart, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/cn';
import type { ViewId } from '../types';

const ACTIONS: { id: string; label: string; view: ViewId; icon: typeof Plus; event?: string }[] = [
  { id: 'event', label: 'Event', view: 'calendar', icon: Calendar, event: 'fcc:quick-add' },
  { id: 'todo', label: 'To-do', view: 'todos', icon: CheckSquare, event: 'fcc:quick-add' },
  { id: 'chore', label: 'Chore', view: 'chores', icon: RefreshCw },
  { id: 'shop', label: 'Shopping', view: 'shopping', icon: ShoppingCart, event: 'fcc:quick-add' },
];

/** Home-only speed-dial for common add actions (mobile). */
export function QuickAddFab() {
  const { view, setView, isMediaOnly } = useApp();
  const [open, setOpen] = useState(false);

  if (isMediaOnly || view !== 'dashboard') return null;

  const run = (a: (typeof ACTIONS)[0]) => {
    setOpen(false);
    setView(a.view);
    if (a.event) {
      // Let destination page mount, then open form
      setTimeout(() => window.dispatchEvent(new CustomEvent(a.event!)), 80);
    }
  };

  return (
    <div className="lg:hidden fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => run(a)}
              className="flex items-center gap-2 pl-3 pr-3.5 py-2.5 rounded-2xl bg-surface border border-border shadow-lg text-sm font-medium text-fg hover:bg-nav-hover"
            >
              <a.icon className="w-4 h-4 text-indigo-500" />
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-14 h-14 rounded-2xl text-white shadow-xl shadow-indigo-500/40 flex items-center justify-center active:scale-95 transition-all',
          open ? 'bg-slate-600' : 'bg-indigo-500 hover:bg-indigo-400',
        )}
        aria-label={open ? 'Close quick add' : 'Quick add'}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </div>
  );
}
