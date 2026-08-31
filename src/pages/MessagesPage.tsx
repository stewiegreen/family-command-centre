import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiPicker } from '../components/EmojiPicker';
import { MAX_MESSAGES_PER_THREAD } from '../lib/firebase';
import { cn } from '../lib/cn';

/** Readable text on a coloured bubble (white on dark/saturated, dark on light). */
function contrastText(hex: string): string {
  const c = (hex || '#6366f1').replace('#', '');
  if (c.length < 6) return '#ffffff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1a1a' : '#ffffff';
}

function softTimestampColor(hex: string): string {
  return contrastText(hex) === '#ffffff' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)';
}

export function MessagesPage() {
  const { data, currentUser, getMember, sendMessage, markThreadRead } = useApp();
  const me = currentUser?.id || data.settings.currentUserId;
  const others = data.members
    .filter((m) => m.id !== me && m.role !== 'media')
    .map((m) => getMember(m.id) || m);
  const [chatId, setChatId] = useState(others[0]?.id || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const thread = data.messages
    .filter((m) => (m.fromId === me && m.toId === chatId) || (m.fromId === chatId && m.toId === me))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-MAX_MESSAGES_PER_THREAD);

  useEffect(() => {
    if (!chatId && others[0]) setChatId(others[0].id);
  }, [others, chatId]);

  useEffect(() => {
    if (chatId) void markThreadRead(chatId);
  }, [chatId, me, markThreadRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        const pos = start + emoji.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    } else {
      setText((t) => t + emoji);
    }
  };

  const send = async () => {
    if (!text.trim() || !chatId || sending) return;
    setSending(true);
    try {
      await sendMessage(chatId, text);
      setText('');
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  if (others.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={MessageCircle} title="No one to message" description="Add family members first." />
      </div>
    );
  }

  const meLook = getMember(me) || currentUser;
  const chatPartner = getMember(chatId);

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)] flex flex-col gap-3">
      <h1 className="text-xl font-bold">Messages</h1>
      <p className="text-xs text-muted -mt-1">
        Private between you and each person — others cannot read these. Latest {MAX_MESSAGES_PER_THREAD} per chat are kept.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {others.map((m) => {
          const unread = data.messages.filter((msg) => msg.fromId === m.id && msg.toId === me && !msg.read).length;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setChatId(m.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm shrink-0 border relative',
                chatId === m.id ? 'border-accent bg-accent/15' : 'border-border-strong',
              )}
            >
              <Avatar {...m} size="sm" className="!w-8 !h-8 !text-base" />
              {m.name}
              {unread > 0 && (
                <span className="bg-accent text-accent-ink text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Card className="flex-1 flex flex-col !p-0 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {thread.length === 0 && (
            <p className="text-base text-muted text-center py-8">No messages yet. Say hello!</p>
          )}
          {thread.map((m) => {
            const mine = m.fromId === me;
            const sender = mine ? meLook : chatPartner || getMember(m.fromId);
            const bg = sender?.color || (mine ? '#6366f1' : '#374151');
            const fg = contrastText(bg);
            const ts = softTimestampColor(bg);
            return (
              <div key={m.id} className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                {!mine && (
                  <Avatar
                    name={sender?.name}
                    emoji={sender?.emoji}
                    color={sender?.color}
                    size="sm"
                    className="!w-8 !h-8 !text-base mb-0.5"
                  />
                )}
                <div
                  className={cn(
                    'max-w-[80%] px-3.5 py-2 rounded-2xl text-base whitespace-pre-wrap break-words leading-snug',
                    mine ? 'rounded-br-md' : 'rounded-bl-md',
                  )}
                  style={{ backgroundColor: bg, color: fg }}
                >
                  {m.text}
                  <div className="text-xs mt-1" style={{ color: ts }}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                {mine && (
                  <Avatar
                    name={sender?.name}
                    emoji={sender?.emoji}
                    color={sender?.color}
                    size="sm"
                    className="!w-8 !h-8 !text-base mb-0.5"
                  />
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="p-3 border-t border-border flex items-end gap-2">
          <EmojiPicker onPick={insertEmoji} />
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
            className="flex-1 text-base"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="p-2.5 rounded-xl bg-accent text-accent-ink hover:bg-accent disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </Card>
    </div>
  );
}
