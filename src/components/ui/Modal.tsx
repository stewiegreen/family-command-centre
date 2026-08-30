import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-surface border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto',
          wide ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-surface/95 backdrop-blur z-10">
          <h2 className="font-semibold text-lg text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-nav-hover text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
