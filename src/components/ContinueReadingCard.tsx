import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Library, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ComicReader } from './ComicReader';
import { FlipCard } from './FlipCard';
import {
  bookProgressPercent,
  bookTitle,
  komgaBookThumbUrl,
  komgaInProgress,
  komgaOnDeck,
  type KomgaBook,
} from '../lib/komga';
import { cn } from '../lib/cn';

const DECK_SIZE = 8;

function BookStrip({
  books,
  memberId,
  loading,
  error,
  empty,
  onOpen,
  onRefresh,
  onMedia,
}: {
  books: KomgaBook[];
  memberId?: string;
  loading: boolean;
  error: string | null;
  empty: string;
  onOpen: (b: KomgaBook) => void;
  onRefresh: () => void;
  onMedia: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {error && <p className="text-xs text-warn mb-2 line-clamp-3 shrink-0">{error}</p>}

      {loading && books.length === 0 && !error && (
        <p className="text-sm text-muted py-8 text-center flex-1">Loading…</p>
      )}

      {!loading && books.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
          <p className="text-sm text-muted">{empty}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onRefresh}>
              Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={onMedia}>
              Open Media
            </Button>
          </div>
        </div>
      )}

      {books.length > 0 && (
        <>
          {/*
            Covers size from available card height (not a fixed rem width).
            aspect-ratio 2/3 → width follows height so a tall/full-width card
            fills with large covers instead of a small strip and empty space.
          */}
          <div className="flex-1 min-h-[9rem] flex gap-3 overflow-x-auto overflow-y-hidden items-stretch px-0.5 -mx-0.5">
            {books.map((b) => {
              const pct = bookProgressPercent(b);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpen(b)}
                  className="h-full max-h-full shrink-0 flex flex-col text-left group"
                >
                  <div
                    className="relative rounded-lg overflow-hidden bg-surface-2 border border-border shadow-sm min-h-0"
                    style={{
                      height: 'calc(100% - 2.35rem)',
                      aspectRatio: '2 / 3',
                      width: 'auto',
                    }}
                  >
                    <img
                      src={komgaBookThumbUrl(b.id, memberId)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {pct > 0 && pct < 100 && (
                      <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40 z-10">
                        <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] sm:text-[11px] font-medium text-fg line-clamp-2 leading-snug max-w-[7rem] sm:max-w-[9rem]">
                    {bookTitle(b)}
                  </p>
                  {pct > 0 && pct < 100 ? (
                    <p className="text-[10px] text-muted tabular-nums leading-none">
                      {Math.round(pct)}%
                    </p>
                  ) : (
                    <p className="text-[10px] text-transparent leading-none">·</p>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onMedia}
            className="mt-2 text-[11px] text-muted hover:text-fg self-start shrink-0"
          >
            See all in Media →
          </button>
        </>
      )}
    </div>
  );
}

function FaceHeader({
  icon,
  title,
  subtitle,
  loading,
  onRefresh,
}: {
  icon: 'deck' | 'progress';
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  const Icon = icon === 'deck' ? Library : BookOpen;
  return (
    <div className="flex items-center gap-2 mb-3 shrink-0">
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
          icon === 'deck' ? 'bg-sky-500/15 text-sky-500' : 'bg-amber-500/15 text-amber-500',
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-fg text-lg leading-tight">{title}</h3>
        <p className="text-[11px] text-muted truncate">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-inset"
        title="Refresh"
      >
        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
      </button>
    </div>
  );
}

/**
 * Home flip card:
 * - Front: On Deck (next up from Komga)
 * - Back: Continue reading (IN_PROGRESS)
 * Covers scale with card height so tall/full-width layouts fill the face.
 */
export function ContinueReadingCard() {
  const { currentUser, data, setView } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || undefined;

  const [onDeck, setOnDeck] = useState<KomgaBook[]>([]);
  const [inProgress, setInProgress] = useState<KomgaBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<KomgaBook | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deck, progress] = await Promise.all([
        komgaOnDeck(DECK_SIZE, memberId),
        komgaInProgress(DECK_SIZE, memberId),
      ]);
      setOnDeck(deck.filter((b) => b?.id));
      setInProgress(progress.filter((b) => b?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load books');
      setOnDeck([]);
      setInProgress([]);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const goMedia = () => setView('media');
  const openBook = (b: KomgaBook) => setReading(b);

  // h-full + flex-1 chain so covers can consume leftover height; pb for flip chip
  const faceClass = '!p-4 pb-12 h-full flex flex-col min-h-[16rem]';

  return (
    <>
      <FlipCard
        storageKey="komga-ondeck-progress"
        frontLabel="On Deck"
        backLabel="Continue reading"
        front={
          <Card className={faceClass}>
            <FaceHeader
              icon="deck"
              title="On Deck"
              subtitle="Next up in your library"
              loading={loading}
              onRefresh={() => void load()}
            />
            <BookStrip
              books={onDeck}
              memberId={memberId}
              loading={loading}
              error={error}
              empty="Nothing on deck right now."
              onOpen={openBook}
              onRefresh={() => void load()}
              onMedia={goMedia}
            />
          </Card>
        }
        back={
          <Card className={faceClass}>
            <FaceHeader
              icon="progress"
              title="Continue reading"
              subtitle="Started — not finished yet"
              loading={loading}
              onRefresh={() => void load()}
            />
            <BookStrip
              books={inProgress}
              memberId={memberId}
              loading={loading}
              error={error}
              empty="No comics in progress."
              onOpen={openBook}
              onRefresh={() => void load()}
              onMedia={goMedia}
            />
          </Card>
        }
      />

      {reading && (
        <ComicReader
          book={reading}
          memberId={memberId}
          onClose={() => {
            setReading(null);
            void load();
          }}
          onOpenBook={(b) => setReading(b)}
        />
      )}
    </>
  );
}
