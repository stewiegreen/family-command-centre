import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn';

type Props = {
  /** sessionStorage key so the face sticks for this browser tab */
  storageKey: string;
  frontLabel: string;
  backLabel: string;
  /** Status chip when on the front (e.g. "2 to approve") — only shown then */
  frontBadge?: string;
  /** Status chip when on the back (e.g. "1 running") — only shown then */
  backBadge?: string;
  front: ReactNode;
  back: ReactNode;
  className?: string;
};

/**
 * Two-faced home card. Flip control sits inside the card (top-right).
 * Both faces share one height (taller content wins) so the layout does not jump.
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
  const [minH, setMinH] = useState<number | undefined>(undefined);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    const measure = () => {
      const fh = frontRef.current?.scrollHeight ?? 0;
      const bh = backRef.current?.scrollHeight ?? 0;
      const next = Math.max(fh, bh);
      if (next > 0) setMinH(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [front, back, flipped]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  };

  // Badge describes the *current* face only when useful — never bank minutes on timer→quests
  const badge = flipped ? backBadge : frontBadge;
  const otherLabel = flipped ? frontLabel : backLabel;

  const flipBtn = (
    <button
      type="button"
      onClick={toggle}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'absolute bottom-3 right-3 z-20',
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/95',
        'px-2.5 py-1 text-[11px] font-medium text-muted hover:text-fg hover:border-border-strong',
        'shadow-sm backdrop-blur-sm transition-colors',
      )}
      title={`Show ${otherLabel}`}
    >
      <RefreshCw className={cn('w-3 h-3 shrink-0', flipped && 'rotate-180 transition-transform')} />
      <span className="whitespace-nowrap">
        Flip to {otherLabel}
        {badge ? (
          <span className="ml-1 text-accent font-semibold tabular-nums">· {badge}</span>
        ) : null}
      </span>
    </button>
  );

  if (reduceMotion) {
    return (
      <div className={cn('relative', className)} style={minH ? { minHeight: minH } : undefined}>
        {flipBtn}
        <div ref={flipped ? backRef : frontRef} className="hq-flip-pad">
          {flipped ? back : front}
        </div>
        {/* Keep both mounted off-layout for height measuring */}
        <div className="sr-only" aria-hidden>
          <div ref={flipped ? frontRef : backRef}>{flipped ? front : back}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative hq-flip-scene', className)}>
      {flipBtn}
      <div
        className={cn('hq-flip-inner', flipped && 'hq-flip-inner--flipped')}
        style={minH ? { minHeight: minH } : undefined}
      >
        <div
          ref={frontRef}
          className={cn('hq-flip-face hq-flip-face--front hq-flip-pad', flipped && 'pointer-events-none')}
        >
          {front}
        </div>
        <div
          ref={backRef}
          className={cn('hq-flip-face hq-flip-face--back hq-flip-pad', !flipped && 'pointer-events-none')}
          aria-hidden={!flipped}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
