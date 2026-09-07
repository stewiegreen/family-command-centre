import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn';

type Props = {
  storageKey: string;
  frontLabel: string;
  backLabel: string;
  frontBadge?: string;
  backBadge?: string;
  front: ReactNode;
  back: ReactNode;
  className?: string;
};

/**
 * Two-faced home card. Flip control is rendered *inside each face* so it
 * always sits on the card surface. Faces share one height (max of both).
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
      // Measure natural content height of both faces (ignore forced minHeight)
      const fh = frontRef.current?.scrollHeight ?? 0;
      const bh = backRef.current?.scrollHeight ?? 0;
      const next = Math.max(fh, bh, 1);
      setMinH((prev) => (prev === next ? prev : next));
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
  }, [front, back]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  };

  const makeBtn = (side: 'front' | 'back') => {
    const onBack = side === 'back';
    // Label = where you go; badge = hint about the *other* side only for front→timer
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

  const faceShell = (
    side: 'front' | 'back',
    ref: RefObject<HTMLDivElement | null>,
    content: ReactNode,
    hidden: boolean,
  ) => (
    <div
      ref={ref}
      className={cn(
        'hq-flip-face',
        side === 'front' ? 'hq-flip-face--front' : 'hq-flip-face--back',
        hidden && 'pointer-events-none',
      )}
      aria-hidden={hidden}
      style={minH ? { minHeight: minH } : undefined}
    >
      <div className="hq-flip-face-body">
        {content}
        {makeBtn(side)}
      </div>
    </div>
  );

  if (reduceMotion) {
    return (
      <div className={cn('relative', className)} style={minH ? { minHeight: minH } : undefined}>
        <div className="hq-flip-face-body" style={minH ? { minHeight: minH } : undefined}>
          {flipped ? back : front}
          {makeBtn(flipped ? 'back' : 'front')}
        </div>
        {/* Off-screen measure twin */}
        <div className="absolute opacity-0 pointer-events-none -z-10 w-full" aria-hidden>
          <div ref={frontRef}>{front}</div>
          <div ref={backRef}>{back}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('hq-flip-scene', className)}>
      <div
        className={cn('hq-flip-inner', flipped && 'hq-flip-inner--flipped')}
        style={minH ? { minHeight: minH } : undefined}
      >
        {faceShell('front', frontRef, front, flipped)}
        {faceShell('back', backRef, back, !flipped)}
      </div>
    </div>
  );
}
