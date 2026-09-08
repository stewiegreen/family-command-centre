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
  /** Optional chip on Flip to Timer (front face only) */
  frontBadge?: string;
  front: ReactNode;
  back: ReactNode;
  className?: string;
};

/**
 * Two-faced home card. Fills parent height when paired (h-full chain).
 * Faces share max(content) min-height so front/back match each other.
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
  const frontMeasureRef = useRef<HTMLDivElement>(null);
  const backMeasureRef = useRef<HTMLDivElement>(null);

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

  // Measure natural content height of both faces (hidden clones) so they match each other
  useLayoutEffect(() => {
    const measure = () => {
      const fh = frontMeasureRef.current?.scrollHeight ?? 0;
      const bh = backMeasureRef.current?.scrollHeight ?? 0;
      const next = Math.max(fh, bh, 1);
      setContentMinH((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    if (frontMeasureRef.current) ro.observe(frontMeasureRef.current);
    if (backMeasureRef.current) ro.observe(backMeasureRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [front, back]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  };

  const makeBtn = (side: 'front' | 'back') => {
    const onBack = side === 'back';
    const otherLabel = onBack ? frontLabel : backLabel;
    // Only show frontBadge when leaving the front (Flip to Timer)
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

  const faceShell = (
    side: 'front' | 'back',
    content: ReactNode,
    hidden: boolean,
  ) => (
    <div
      className={cn(
        'hq-flip-face',
        side === 'front' ? 'hq-flip-face--front' : 'hq-flip-face--back',
        hidden && 'pointer-events-none',
      )}
      aria-hidden={hidden}
    >
      <div className="hq-flip-face-body">
        {content}
        {makeBtn(side)}
      </div>
    </div>
  );

  const measureTwins = (
    <div
      className="absolute opacity-0 pointer-events-none -z-10 w-full left-0 top-0 overflow-hidden"
      aria-hidden
      style={{ height: 0 }}
    >
      <div ref={frontMeasureRef} className="hq-flip-measure">
        {front}
      </div>
      <div ref={backMeasureRef} className="hq-flip-measure">
        {back}
      </div>
    </div>
  );

  if (reduceMotion) {
    return (
      <div
        className={cn('relative h-full min-h-0 flex flex-col', className)}
        style={contentMinH ? { minHeight: contentMinH } : undefined}
      >
        <div className="hq-flip-face-body flex-1 min-h-0">
          {flipped ? back : front}
          {makeBtn(flipped ? 'back' : 'front')}
        </div>
        {measureTwins}
      </div>
    );
  }

  return (
    <div
      className={cn('hq-flip-scene h-full min-h-0', className)}
      style={contentMinH ? { minHeight: contentMinH } : undefined}
    >
      <div
        className={cn('hq-flip-inner h-full', flipped && 'hq-flip-inner--flipped')}
        style={contentMinH ? { minHeight: contentMinH } : undefined}
      >
        {faceShell('front', front, flipped)}
        {faceShell('back', back, !flipped)}
      </div>
      {measureTwins}
    </div>
  );
}
