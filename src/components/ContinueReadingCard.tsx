import { useCallback, useEffect, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ComicReader } from './ComicReader';
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

/**
 * Home card: Komga On Deck (+ fill from In Progress if needed).
 * Tap a cover → in-app ComicReader (same as Media).
 */
export function ContinueReadingCard() {
  const { currentUser, data, setView } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || undefined;

  const [books, setBooks] = useState<KomgaBook[]>([]);
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
      const seen = new Set<string>();
      const merged: KomgaBook[] = [];
      for (const b of [...deck, ...progress]) {
        if (!b?.id || seen.has(b.id)) continue;
        seen.add(b.id);
        merged.push(b);
        if (merged.length >= DECK_SIZE) break;
      }
      setBooks(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load books');
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Card className="!p-4 h-full flex flex-col min-h-[12rem]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-fg text-sm leading-tight">Continue reading</h3>
            <p className="text-[11px] text-muted truncate">On deck from your library</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-inset"
            title="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-warn mb-2 line-clamp-3">{error}</p>
        )}

        {loading && books.length === 0 && !error && (
          <p className="text-sm text-muted py-8 text-center flex-1">Loading…</p>
        )}

        {!loading && books.length === 0 && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-sm text-muted">Nothing on deck right now.</p>
            <Button size="sm" variant="secondary" onClick={() => setView('media')}>
              Open Media
            </Button>
          </div>
        )}

        {books.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x flex-1 items-start">
            {books.map((b) => {
              const pct = bookProgressPercent(b);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setReading(b)}
                  className="snap-start shrink-0 w-[4.75rem] sm:w-24 text-left group"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-2 border border-border shadow-sm">
                    <img
                      src={komgaBookThumbUrl(b.id, memberId)}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {pct > 0 && pct < 100 && (
                      <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40">
                        <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] sm:text-[11px] font-medium text-fg line-clamp-2 leading-snug">
                    {bookTitle(b)}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {books.length > 0 && (
          <button
            type="button"
            onClick={() => setView('media')}
            className="mt-2 text-[11px] text-muted hover:text-fg self-start"
          >
            See all in Media →
          </button>
        )}
      </Card>

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
