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
  storageKey: string;
  frontLabel: string;
  backLabel: string;
  frontBadge?: string;
  front: ReactNode;
  back: ReactNode;
  className?: string;
};

/**
 * Two-face card. Front/back mounted once each.
 * Flip control sits absolute bottom-right *on* the card surface
 * (card gets bottom padding so content stays clear).
 */
export function FlipCard({
  storageKey,
  frontLabel,
  backLabel,
  frontBadge,
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
  const [contentMinH, setContentMinH] = useState<number | undefined>(undefined);
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
      const next = Math.max(fh, bh, 1);
      setContentMinH((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [front, back, flipped]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  };

  const makeBtn = (side: 'front' | 'back') => {
    const onBack = side === 'back';
    const otherLabel = onBack ? frontLabel : backLabel;
    const badge = onBack ? undefined : frontBadge;
    return (
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
        <RefreshCw className={cn('w-3 h-3 shrink-0', onBack && 'rotate-180')} />
        <span className="whitespace-nowrap">
          Flip to {otherLabel}
          {badge ? (
            <span className="ml-1 text-accent font-semibold tabular-nums">· {badge}</span>
          ) : null}
        </span>
      </button>
    );
  };

  if (reduceMotion) {
    return (
      <div
        className={cn('hq-flip-root relative h-full min-h-0 w-full', className)}
        style={contentMinH ? { minHeight: contentMinH } : undefined}
      >
        <div
          ref={frontRef}
          className={cn('hq-flip-face-body relative w-full min-w-0', flipped && 'hidden')}
          aria-hidden={flipped}
        >
          {front}
          {!flipped ? makeBtn('front') : null}
        </div>
        <div
          ref={backRef}
          className={cn('hq-flip-face-body relative w-full min-w-0', !flipped && 'hidden')}
          aria-hidden={!flipped}
        >
          {back}
          {flipped ? makeBtn('back') : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('hq-flip-root hq-flip-scene h-full min-h-0 w-full', className)}
      style={contentMinH ? { minHeight: contentMinH } : undefined}
    >
      <div
        className={cn('hq-flip-inner h-full w-full', flipped && 'hq-flip-inner--flipped')}
        style={contentMinH ? { minHeight: contentMinH } : undefined}
      >
        <div
          ref={frontRef}
          className={cn(
            'hq-flip-face hq-flip-face--front w-full',
            flipped && 'pointer-events-none',
          )}
          aria-hidden={flipped}
        >
          <div className="hq-flip-face-body relative w-full min-w-0 h-full">
            {front}
            {makeBtn('front')}
          </div>
        </div>
        <div
          ref={backRef}
          className={cn(
            'hq-flip-face hq-flip-face--back w-full',
            !flipped && 'pointer-events-none',
          )}
          aria-hidden={!flipped}
        >
          <div className="hq-flip-face-body relative w-full min-w-0 h-full">
            {back}
            {makeBtn('back')}
          </div>
        </div>
      </div>
    </div>
  );
}
