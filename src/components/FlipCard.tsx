import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn';

type Props = {
  /** sessionStorage key so the face sticks for this browser tab */
  storageKey: string;
  frontLabel: string;
  backLabel: string;
  /** Small status on the flip control when showing the front (e.g. "2 approve") */
  frontBadge?: string;
  /** Small status when showing the back */
  backBadge?: string;
  front: ReactNode;
  back: ReactNode;
  className?: string;
};

/**
 * Two-faced home card: explicit flip control (does not steal card drag),
 * 3D rotate when motion is OK, instant swap when prefers-reduced-motion.
 */
export function FlipCard({
  storageKey,
  frontLabel,
  backLabel,
  frontBadge,
  backBadge,
  front,
  back,
  className,
}: Props) {
  const key = `hq-flip:${storageKey}`;
  const [flipped, setFlipped] = useState(() => {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, flipped ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [flipped, key]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  };

  const badge = flipped ? backBadge : frontBadge;
  const otherLabel = flipped ? frontLabel : backLabel;

  return (
    <div className={cn('relative', className)}>
      {/* Explicit control — not the whole card — so DnD still works on SectionChrome */}
      <div className="flex items-center justify-end mb-1.5">
        <button
          type="button"
          onClick={toggle}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/80',
            'px-2.5 py-1 text-[11px] font-medium text-muted hover:text-fg hover:border-border-strong',
            'transition-colors backdrop-blur-sm',
          )}
          title={`Show ${otherLabel}`}
        >
          <RefreshCw className={cn('w-3 h-3', flipped && 'rotate-180 transition-transform')} />
          <span>
            Flip to {otherLabel}
            {badge ? (
              <span className="ml-1 text-accent font-semibold tabular-nums">· {badge}</span>
            ) : null}
          </span>
        </button>
      </div>

      {reduceMotion ? (
        <div>{flipped ? back : front}</div>
      ) : (
        <div className="hq-flip-scene">
          <div className={cn('hq-flip-inner', flipped && 'hq-flip-inner--flipped')}>
            <div className="hq-flip-face hq-flip-face--front">{front}</div>
            <div className="hq-flip-face hq-flip-face--back" aria-hidden={!flipped}>
              {back}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
