import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * md — default (max-w-md / sm:max-w-lg)
   * lg — ~1.5× wider (max-w-3xl) — recipe edit/view
   * xl — max-w-4xl
   * wide — legacy alias for lg
   */
  size?: 'md' | 'lg' | 'xl';
  /** @deprecated use size="lg" */
  wide?: boolean;
}

const SIZE_CLASS = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-4xl',
} as const;

export function Modal({ open, onClose, title, children, size, wide }: ModalProps) {
  if (!open) return null;
  const resolved: keyof typeof SIZE_CLASS = size ?? (wide ? 'lg' : 'md');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-surface border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto',
          SIZE_CLASS[resolved],
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
