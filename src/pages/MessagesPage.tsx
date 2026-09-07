import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, ImagePlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiPicker } from '../components/EmojiPicker';
import { MAX_MESSAGES_PER_THREAD, getFirebaseAuth } from '../lib/firebase';
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

/** Detect http(s) image URLs so chat can show them without file uploads. */
const IMAGE_EXT = 'png|jpe?g|gif|webp|avif|bmp|svg';
const IMAGE_URL_RE = new RegExp(
  `https?:\\/\\/[^\\s<>"'\\]]+\\.(?:${IMAGE_EXT})(?:\\?[^\\s<>"']*)?`,
  'gi',
);

function cleanImageUrl(raw: string): string {
  // Strip trailing punctuation often included when pasting
  return raw.replace(/[),.;:!?>\]]+$/g, '');
}

function ChatImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all text-sm opacity-90"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block my-1 -mx-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={url}
        alt="Shared photo"
        loading="lazy"
        referrerPolicy="no-referrer"
        decoding="async"
        className="max-w-full w-auto max-h-72 rounded-xl object-contain bg-black/25 block"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

function MessageBody({ text }: { text: string }) {
  const parts: { type: 'text' | 'image'; value: string }[] = [];
  const re = new RegExp(IMAGE_URL_RE.source, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = cleanImageUrl(m[0]);
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'image', value: url });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  if (parts.length === 0) parts.push({ type: 'text', value: text });

  const onlyImage = parts.length === 1 && parts[0]!.type === 'image';

  return (
    <div className={onlyImage ? '' : 'space-y-1'}>
      {parts.map((part, i) =>
        part.type === 'image' ? (
          <ChatImage key={`img-${i}`} url={part.value} />
        ) : (
          <span key={`t-${i}`} className="whitespace-pre-wrap">
            {part.value}
          </span>
        ),
      )}
    </div>
  );
}

export function MessagesPage() {
  const { data, currentUser, getMember, sendMessage, markThreadRead, familyId } = useApp();
  const me = currentUser?.id || data.settings.currentUserId;
  const others = data.members
    .filter((m) => m.id !== me && m.role !== 'media')
    .map((m) => getMember(m.id) || m);
  const [chatId, setChatId] = useState(others[0]?.id || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
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

  const uploadPhoto = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      if (!user) {
        setUploadError('Sign in required to upload photos.');
        return;
      }
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('photo', file);
      if (familyId) form.append('familyId', familyId);
      const res = await fetch('/api/messages-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUploadError(data.error || `Upload failed (${res.status})`);
        return;
      }
      setText((prev) => {
        const next = prev.trim() ? `${prev.trim()}\n${data.url}` : data.url!;
        return next;
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
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
      <h1 className="text-xl font-bold flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-accent" />
        Messages
      </h1>
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
              <Avatar {...m} size="sm" />
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
                    className="mb-0.5"
                  />
                )}
                <div
                  className={cn(
                    'max-w-[80%] px-3.5 py-2 rounded-2xl text-base break-words leading-snug',
                    mine ? 'rounded-br-md' : 'rounded-bl-md',
                  )}
                  style={{ backgroundColor: bg, color: fg }}
                >
                  <MessageBody text={m.text} />
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
                    className="mb-0.5"
                  />
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="p-3 border-t border-border space-y-1.5">
          {(uploading || uploadError) && (
            <p className={`text-xs px-1 ${uploadError ? 'text-warn' : 'text-muted'}`}>
              {uploading ? 'Uploading photo…' : uploadError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <EmojiPicker onPick={insertEmoji} />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
              }}
            />
            <button
              type="button"
              title="Add photo"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="p-2.5 rounded-xl border border-border text-muted hover:text-fg hover:bg-nav-hover disabled:opacity-50"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message…"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
              className="flex-1 text-base"
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || uploading}
              className="p-2.5 rounded-xl bg-accent text-accent-ink hover:bg-accent disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
