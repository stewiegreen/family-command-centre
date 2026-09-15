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
 * Two-face card. Front/back are each mounted exactly once.
 * Flip control is a compact bar at the bottom of the face — not a floating
 * chip in empty side space.
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
      <div className="hq-flip-footer shrink-0 w-full flex justify-end pt-1">
        <button
          type="button"
          onClick={toggle}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
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
      </div>
    );
  };

  const faceBody = (
    side: 'front' | 'back',
    ref: typeof frontRef,
    content: ReactNode,
    visible: boolean,
  ) => (
    <div
      ref={ref}
      className={cn(
        'hq-flip-face-body w-full min-w-0',
        !visible && 'hidden',
      )}
      aria-hidden={!visible}
    >
      <div className="hq-flip-face-main w-full min-w-0 flex-1 flex flex-col min-h-0">
        {content}
      </div>
      {visible ? makeBtn(side) : null}
    </div>
  );

  if (reduceMotion) {
    return (
      <div
        className={cn('hq-flip-root relative h-full min-h-0 w-full', className)}
        style={contentMinH ? { minHeight: contentMinH } : undefined}
      >
        {faceBody('front', frontRef, front, !flipped)}
        {faceBody('back', backRef, back, flipped)}
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
          className={cn(
            'hq-flip-face hq-flip-face--front w-full',
            flipped && 'pointer-events-none',
          )}
          aria-hidden={flipped}
        >
          <div ref={frontRef} className="hq-flip-face-body w-full min-w-0">
            <div className="hq-flip-face-main w-full min-w-0 flex-1 flex flex-col min-h-0">
              {front}
            </div>
            {makeBtn('front')}
          </div>
        </div>
        <div
          className={cn(
            'hq-flip-face hq-flip-face--back w-full',
            !flipped && 'pointer-events-none',
          )}
          aria-hidden={!flipped}
        >
          <div ref={backRef} className="hq-flip-face-body w-full min-w-0">
            <div className="hq-flip-face-main w-full min-w-0 flex-1 flex flex-col min-h-0">
              {back}
            </div>
            {makeBtn('back')}
          </div>
        </div>
      </div>
    </div>
  );
}
