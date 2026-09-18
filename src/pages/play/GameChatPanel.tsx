import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { cloudSendGameChat, subscribeGameChat } from '../../lib/firebase';
import { cn } from '../../lib/cn';
import type { GameChatMessage } from '../../types';

type Props = {
  familyId: string;
  gameId: string;
  myUid: string;
  myMemberId: string;
  /** Other player's Auth uid — panel only mounts when a guest has joined. */
  opponentUid: string;
};

/**
 * Side / under-board chat for one multiplayer game.
 * Subscription stays alive while collapsed so messages keep streaming in.
 */
export function GameChatPanel({
  familyId,
  gameId,
  myUid,
  myMemberId,
  opponentUid,
}: Props) {
  const { getMember, data } = useApp();
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevLen = useRef(0);

  const opponentMember =
    data.members.find((m) => m.uid === opponentUid) ||
    getMember(messages.find((m) => m.fromUid === opponentUid)?.fromMemberId || '');

  useEffect(() => {
    setMessages([]);
    setText('');
    setErr(null);
    prevLen.current = 0;
    return subscribeGameChat(
      familyId,
      gameId,
      (list) => setMessages(list),
      (e) => setErr(e.message),
    );
  }, [familyId, gameId]);

  // Scroll only the chat panel — never the whole page (avoid scrollIntoView).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;
    const instant = prevLen.current === 0;
    prevLen.current = messages.length;
    if (instant) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setErr(null);
    try {
      await cloudSendGameChat(familyId, gameId, {
        fromUid: myUid,
        fromMemberId: myMemberId,
        text: value,
      });
      setText('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const nearLimit = text.length >= 220;

  return (
    <Card className="p-0 overflow-hidden lg:sticky lg:top-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60 transition-colors"
        aria-expanded={open}
      >
        <span className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-fg">Game Chat</span>
          <span className="block text-[11px] text-muted truncate">
            {opponentMember?.name
              ? `vs ${opponentMember.name}`
              : 'Trash talk this match only'}
          </span>
        </span>
        {messages.length > 0 && (
          <span className="text-[10px] font-bold text-muted tabular-nums">{messages.length}</span>
        )}
        <span className="text-muted text-xs" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {/* Keep DOM mounted when collapsed so the subscription (parent) stays; only hide UI */}
      <div className={cn(!open && 'hidden')}>
        <div className="border-t border-border">
          <div
            ref={listRef}
            className="h-[340px] overflow-y-auto px-3 py-3 space-y-2"
          >
            {messages.length === 0 && !err && (
              <div className="h-full flex flex-col items-center justify-center text-center px-5">
                <MessageCircle className="w-8 h-8 text-muted/50 mb-2" />
                <p className="text-sm font-semibold text-fg">Let the trash talk begin.</p>
                <p className="text-xs text-muted mt-1">
                  Only you and your opponent can see this. It stays with the game.
                </p>
              </div>
            )}
            {messages.map((msg) => {
              const mine = msg.fromUid === myUid;
              const sender = getMember(msg.fromMemberId);
              return (
                <div
                  key={msg.id}
                  className={cn('flex gap-2', mine ? 'justify-end' : 'justify-start')}
                >
                  {!mine && (
                    <Avatar {...(sender || { name: '?' })} size="sm" className="!w-7 !h-7 !text-sm" />
                  )}
                  <div className={cn('max-w-[82%] flex flex-col', mine ? 'items-end' : 'items-start')}>
                    {!mine && (
                      <p className="text-[10px] font-bold text-muted mb-0.5 px-1">
                        {sender?.name || 'Player'}
                      </p>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3 py-2 text-sm break-words',
                        mine
                          ? 'bg-accent text-white rounded-br-md'
                          : 'bg-surface-2 text-fg rounded-bl-md',
                      )}
                    >
                      {msg.text}
                    </div>
                    <p className="text-[9px] text-muted mt-0.5 px-1">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {err && <p className="px-3 pb-2 text-[11px] text-warn">{err}</p>}
          <form onSubmit={(e) => void send(e)} className="border-t border-border p-2 flex gap-2 items-end">
            <div className="min-w-0 flex-1 relative">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 240))}
                maxLength={240}
                placeholder="Taunt your opponent…"
                className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent"
                aria-label="Game chat message"
              />
              {nearLimit && (
                <span className="absolute right-2 -top-4 text-[10px] tabular-nums text-muted">
                  {text.length}/240
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-default shrink-0"
              aria-label="Send game chat message"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}
