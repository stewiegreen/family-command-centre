/**
 * Drag / hide / width chrome around a homescreen widget card.
 */
import type { DragEvent, ReactNode } from 'react';
import { Columns2, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { SectionId } from './constants';

export function SectionChrome({
  id,
  paired,
  dragging,
  dropSide,
  widthMode,
  onCycleWidth,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHide,
  children,
  className,
}: {
  id: SectionId;
  paired: boolean;
  dragging: boolean;
  dropSide: 'left' | 'right' | null;
  widthMode?: 'equal' | 'wide' | 'narrow';
  onCycleWidth?: () => void;
  onDragStart: (id: SectionId) => void;
  onDragOver: (e: DragEvent, id: SectionId) => void;
  onDrop: (e: DragEvent, id: SectionId) => void;
  onDragEnd: () => void;
  onHide: (id: SectionId) => void;
  children: ReactNode;
  className?: string;
}) {
  const widthTitle =
    widthMode === 'wide'
      ? 'Wide (⅔) — click for narrow'
      : widthMode === 'narrow'
        ? 'Narrow (⅓) — click for equal'
        : 'Equal halves — click for wide';

  return (
    <div
      className={cn(
        'relative group/section transition-opacity min-h-0 flex flex-col',
        paired && 'h-full',
        dragging && 'opacity-40',
        className,
      )}
      draggable
      onDragStart={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        try {
          e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 40, 20);
        } catch {
          /* ignore */
        }
        onDragStart(id);
      }}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e, id);
      }}
      onDragEnd={onDragEnd}
    >
      {dropSide === 'left' && (
        <div className="pointer-events-none absolute inset-y-2 left-0 w-1.5 rounded-full bg-accent z-10 shadow-[0_0_8px_var(--app-accent,#38bdf8)]" />
      )}
      {dropSide === 'right' && (
        <div className="pointer-events-none absolute inset-y-2 right-0 w-1.5 rounded-full bg-accent z-10 shadow-[0_0_8px_var(--app-accent,#38bdf8)]" />
      )}

      {/*
        Controls sit in the card's top padding zone (inside the border).
        Extra pt on the Card pushes titles/actions below this row.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-2.5 pt-2">
        <div className="pointer-events-auto min-h-[28px] flex items-center">
          {paired && onCycleWidth ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCycleWidth();
              }}
              className={cn(
                'p-1.5 rounded-lg border shadow-sm',
                'bg-elevated/95 border-border text-muted hover:text-fg',
                widthMode && widthMode !== 'equal' && 'text-accent border-accent/40',
              )}
              title={widthTitle}
              aria-label={widthTitle}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHide(id);
          }}
          className={cn(
            'pointer-events-auto p-1.5 rounded-lg border shadow-sm',
            'bg-elevated/95 border-border text-muted hover:text-fg',
          )}
          title="Hide this card"
          aria-label="Hide this card"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className={cn(
          'min-w-0 flex flex-col flex-1',
          // Reserve a header band *inside* the card surface for hide/width.
          // Direct Card children: pad the card.
          // FlipCard: pad the face Card (first child of face-body), not the flip root.
          '[&>*:not(.hq-flip-root):not(.hq-no-chrome-pad)]:!pt-10',
          '[&_.hq-flip-face-body>*:first-child]:!pt-10',
          paired && '[&>*]:h-full [&_.hq-flip-face-body>*:first-child]:h-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}

