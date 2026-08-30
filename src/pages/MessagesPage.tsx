import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiPicker } from '../components/EmojiPicker';
import { cn } from '../lib/cn';

export function MessagesPage() {
  const { data, currentUser, sendMessage, markThreadRead } = useApp();
  const me = currentUser?.id || data.settings.currentUserId;
  const others = data.members.filter((m) => m.id !== me && m.role !== 'media');
  const [chatId, setChatId] = useState(others[0]?.id || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const thread = data.messages
    .filter((m) => (m.fromId === me && m.toId === chatId) || (m.fromId === chatId && m.toId === me))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

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
      // Restore caret after the inserted emoji
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

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)] flex flex-col gap-3">
      <h1 className="text-xl font-bold">Messages</h1>
      <p className="text-xs text-muted -mt-1">Private between you and each person — others cannot read these.</p>
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
              <Avatar {...m} size="sm" className="!w-6 !h-6" />
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
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {thread.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No messages yet. Say hello!</p>
          )}
          {thread.map((m) => {
            const mine = m.fromId === me;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words',
                    mine ? 'bg-accent text-accent-ink rounded-br-md' : 'bg-surface-2 text-fg rounded-bl-md',
                  )}
                >
                  {m.text}
                  <div className={cn('text-[10px] mt-1', mine ? 'text-accent' : 'text-muted')}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
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
            className="flex-1"
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
