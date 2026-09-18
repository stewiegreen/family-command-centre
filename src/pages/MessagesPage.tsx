import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Home,
  ImagePlus,
  Link2,
  ListTodo,
  MessageCircle,
  Pin,
  PinOff,
  Reply,
  Search,
  Send,
  ShoppingCart,
  SmilePlus,
  StickyNote,
  Swords,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiPicker } from '../components/EmojiPicker';
import { MAX_MESSAGES_PER_THREAD, getFirebaseAuth } from '../lib/firebase';
import { cn } from '../lib/cn';
import {
  FAMILY_CHANNEL_ID,
  type Message,
  type MessageAttachment,
  type MessageAttachmentType,
} from '../types';

function contrastText(hex: string): string {
  const c = (hex || '#6366f1').replace('#', '');
  if (c.length < 6) return '#ffffff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1a1a' : '#ffffff';
}


const IMAGE_EXT = 'png|jpe?g|gif|webp|avif|bmp|svg';
const IMAGE_URL_RE = new RegExp(
  `https?:\\/\\/[^\\s<>"'\\]]+\\.(?:${IMAGE_EXT})(?:\\?[^\\s<>"']*)?`,
  'gi',
);

function cleanImageUrl(raw: string): string {
  return raw.replace(/[),.;:!?>\]]+$/g, '');
}

function ChatImage({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all text-sm opacity-90">
        {url}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt=""
        className="max-w-[min(100%,20rem)] max-h-72 rounded-xl object-cover block"
        onError={() => setBroken(true)}
        loading="lazy"
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

  // Prefer photo-first layout when message mixes image + caption
  const images = parts.filter((p) => p.type === 'image');
  const texts = parts.filter((p) => p.type === 'text' && p.value.trim());
  const onlyImage = images.length > 0 && texts.length === 0;

  return (
    <div className={onlyImage ? '' : 'space-y-1.5'}>
      {images.map((part, i) => (
        <ChatImage key={`img-${i}`} url={part.value} />
      ))}
      {texts.map((part, i) => (
        <span key={`t-${i}`} className="whitespace-pre-wrap block">
          {part.value.trim()}
        </span>
      ))}
    </div>
  );
}

function formatListTime(timestamp?: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDaySeparator(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function previewText(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const re = new RegExp(IMAGE_URL_RE.source, 'gi');
  if (re.test(t) && t.replace(re, '').trim().length === 0) return 'Photo';
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '\u2026';
}

function isFamilyMsg(m: Message): boolean {
  return m.channel === 'family' || m.toId === FAMILY_CHANNEL_ID;
}

function threadMessages(messages: Message[], me: string, partnerId: string): Message[] {
  return messages
    .filter((m) => {
      if (partnerId === FAMILY_CHANNEL_ID) return isFamilyMsg(m);
      if (isFamilyMsg(m)) return false;
      return (
        (m.fromId === me && m.toId === partnerId) ||
        (m.fromId === partnerId && m.toId === me)
      );
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function AttachmentCard({
  att,
  onOpen,
}: {
  att: MessageAttachment;
  onOpen: () => void;
}) {
  const icon =
    att.type === 'todo'
      ? ListTodo
      : att.type === 'event'
        ? Calendar
        : att.type === 'note'
          ? StickyNote
          : att.type === 'shopping'
            ? ShoppingCart
            : Swords;
  const Icon = icon;
  const label =
    att.type === 'todo'
      ? 'Task'
      : att.type === 'event'
        ? 'Event'
        : att.type === 'note'
          ? 'Note'
          : att.type === 'shopping'
            ? 'Shopping'
            : 'Quest';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1.5 w-full text-left rounded-xl border border-white/20 bg-black/15 px-3 py-2 hover:bg-black/25 transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide opacity-80">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="font-semibold text-sm mt-0.5">{att.title}</div>
      {att.subtitle && <div className="text-xs opacity-80 mt-0.5">{att.subtitle}</div>}
      <div className="text-[11px] font-medium mt-1.5 opacity-90">Open →</div>
    </button>
  );
}

type ConvRow = {
  memberId: string;
  latest?: Message;
  unread: number;
  matchSnippet?: string;
};

export function MessagesPage() {
  const {
    data,
    currentUser,
    getMember,
    sendMessage,
    markThreadRead,
    toggleMessageReaction,
    familyId,
    update,
    setView,
  } = useApp();

  const me = currentUser?.id || data.settings.currentUserId;

  const others = useMemo(
    () =>
      data.members
        .filter((m) => m.id !== me && m.role !== 'media')
        .map((m) => getMember(m.id) || m),
    [data.members, getMember, me],
  );

  const [chatId, setChatId] = useState<string>(FAMILY_CHANNEL_ID);
  const [search, setSearch] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactForId, setReactForId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareType, setShareType] = useState<MessageAttachmentType | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevThreadLen = useRef(0);
  const prevChatId = useRef(chatId);

  const pinnedIds = data.appearance?.[me]?.pinnedConversations || [];

  const togglePin = (partnerId: string) => {
    update((d) => {
      const prev = d.appearance?.[me]?.pinnedConversations || [];
      const next = prev.includes(partnerId)
        ? prev.filter((id) => id !== partnerId)
        : [...prev, partnerId];
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [me]: {
            ...(d.appearance?.[me] || {}),
            pinnedConversations: next,
          },
        },
      };
    });
  };

  useEffect(() => {
    if (chatId === FAMILY_CHANNEL_ID) return;
    if (!chatId || !others.some((m) => m.id === chatId)) {
      setChatId(FAMILY_CHANNEL_ID);
    }
  }, [chatId, others]);

  const conversations = useMemo((): ConvRow[] => {
    const familyMsgs = threadMessages(data.messages, me, FAMILY_CHANNEL_ID);
    const familyLatest = familyMsgs[familyMsgs.length - 1];
    const familyUnread = familyMsgs.filter(
      (m) => m.fromId !== me && !(m.readBy || []).includes(me),
    ).length;

    const dms = others.map((member) => {
      const messages = threadMessages(data.messages, me, member.id);
      const latest = messages[messages.length - 1];
      const unread = messages.filter(
        (m) => m.fromId === member.id && m.toId === me && !m.read,
      ).length;
      return { memberId: member.id, latest, unread };
    });

    const sorted = dms.sort((a, b) => {
      const aPin = pinnedIds.includes(a.memberId) ? 1 : 0;
      const bPin = pinnedIds.includes(b.memberId) ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      const aTime = a.latest ? new Date(a.latest.timestamp).getTime() : 0;
      const bTime = b.latest ? new Date(b.latest.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    return [
      { memberId: FAMILY_CHANNEL_ID, latest: familyLatest, unread: familyUnread },
      ...sorted,
    ];
  }, [data.messages, me, others, pinnedIds]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return conversations.map((c) => ({ ...c, matchSnippet: undefined as string | undefined }));
    }

    const rows: ConvRow[] = [];
    for (const c of conversations) {
      const member = others.find((m) => m.id === c.memberId);
      const nameHit =
        c.memberId === FAMILY_CHANNEL_ID
          ? 'family'.includes(q) || 'everyone'.includes(q)
          : member?.name.toLowerCase().includes(q);
      const msgs = threadMessages(data.messages, me, c.memberId);
      const hit = msgs
        .slice()
        .reverse()
        .find((m) => m.text.toLowerCase().includes(q));
      if (!nameHit && !hit) continue;
      rows.push({
        ...c,
        matchSnippet: hit ? previewText(hit.text, 60) : undefined,
      });
    }
    return rows;
  }, [conversations, search, data.messages, me, others]);

  const pinnedRows = filteredConversations.filter((c) => pinnedIds.includes(c.memberId));
  const unpinnedRows = filteredConversations.filter((c) => !pinnedIds.includes(c.memberId));

  const thread = useMemo(
    () => threadMessages(data.messages, me, chatId).slice(-MAX_MESSAGES_PER_THREAD),
    [data.messages, me, chatId],
  );

  const threadItems = useMemo(() => {
    type Item =
      | { kind: 'day'; key: string; label: string }
      | { kind: 'msg'; msg: Message; showAvatar: boolean; showTime: boolean };
    const items: Item[] = [];
    let lastDay = '';
    let lastFrom = '';
    let lastTs = 0;

    for (const msg of thread) {
      const dk = dayKey(msg.timestamp);
      if (dk !== lastDay) {
        items.push({ kind: 'day', key: dk, label: formatDaySeparator(msg.timestamp) });
        lastDay = dk;
        lastFrom = '';
        lastTs = 0;
      }
      const ts = new Date(msg.timestamp).getTime();
      const gap = ts - lastTs;
      const showAvatar = msg.fromId !== lastFrom || gap > 5 * 60 * 1000;
      items.push({
        kind: 'msg',
        msg,
        showAvatar,
        showTime: showAvatar || gap > 2 * 60 * 1000,
      });
      lastFrom = msg.fromId;
      lastTs = ts;
    }
    return items;
  }, [thread]);

  const meLook = getMember(me) || currentUser;
  const isFamilyChat = chatId === FAMILY_CHANNEL_ID;
  const chatPartner = isFamilyChat ? null : getMember(chatId);
  const isPinned = chatId && !isFamilyChat ? pinnedIds.includes(chatId) : false;

  useEffect(() => {
    if (chatId) void markThreadRead(chatId);
  }, [chatId, markThreadRead, thread.length]);

  const scrollThreadToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = threadScrollRef.current;
    if (!el) return;
    // Prefer container scroll — more reliable than scrollIntoView inside nested layouts
    el.scrollTo({ top: el.scrollHeight, behavior });
    bottomRef.current?.scrollIntoView({ block: 'end', behavior });
  };

  // Open / switch conversation: jump instantly to latest (no smooth animation)
  useLayoutEffect(() => {
    scrollThreadToBottom('auto');
    // Second frame catches late layout (avatars, wrapped text)
    const id = requestAnimationFrame(() => scrollThreadToBottom('auto'));
    return () => cancelAnimationFrame(id);
  }, [chatId, threadItems.length]);

  // New message while already on this chat: smooth scroll
  useEffect(() => {
    const chatChanged = prevChatId.current !== chatId;
    prevChatId.current = chatId;
    if (chatChanged) {
      prevThreadLen.current = thread.length;
      return;
    }
    if (thread.length > prevThreadLen.current) {
      scrollThreadToBottom('smooth');
    }
    prevThreadLen.current = thread.length;
  }, [thread.length, chatId]);

  const selectConversation = (id: string) => {
    setChatId(id);
    setMobileListOpen(false);
    setReplyTo(null);
    setReactForId(null);
  };

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
      const result = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !result.url) {
        setUploadError(result.error || `Upload failed (${res.status})`);
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${result.url}` : result.url!));
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
      await sendMessage(chatId, text, replyTo ? { replyToId: replyTo.id } : undefined);
      setText('');
      setReplyTo(null);
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '❗', '🎉'] as const;

  const memberNamesLine = others.map((m) => m.name).join(' · ');

  const openAttachment = (att: MessageAttachment) => {
    if (att.type === 'todo') setView('todos');
    else if (att.type === 'event') setView('calendar');
    else if (att.type === 'note') setView('notes');
    else if (att.type === 'shopping') setView('shopping');
    else if (att.type === 'quest') setView('chores');
  };

  const [shareError, setShareError] = useState('');

  const shareAttachment = async (att: MessageAttachment) => {
    if (!chatId) return;
    setShareError('');
    try {
      await sendMessage(chatId, att.title, { attachment: att });
      setShareOpen(false);
      setShareType(null);
    } catch (e) {
      // Previously this failed silently (fire-and-forget `void shareAttachment(...)`
      // at the call sites) — a thrown/rejected write here just did nothing visible,
      // which is exactly how the undefined-subtitle bug went unnoticed. Surface it.
      console.error('[messages] share failed', e);
      setShareError('Could not share that — try again.');
    }
  };

  /**
   * Spreads in `subtitle` only when it has a real value. Firestore's SDK
   * throws on a literal `undefined` field (no ignoreUndefinedProperties
   * here), so `subtitle: cond ? x : undefined` below would silently break
   * the whole share for any item missing that optional field — this is
   * what previously made tasks with no due date fail to share at all.
   */
  const withSubtitle = (subtitle: string | undefined | null) =>
    subtitle ? { subtitle } : {};

  const renderConvButton = (row: ConvRow) => {
    const isFamily = row.memberId === FAMILY_CHANNEL_ID;
    const member = isFamily ? null : others.find((m) => m.id === row.memberId) || getMember(row.memberId);
    if (!isFamily && !member) return null;
    const selected = row.memberId === chatId;
    const { latest, unread, matchSnippet } = row;
    const who =
      latest && latest.fromId !== me
        ? `${getMember(latest.fromId)?.name || 'Someone'}: `
        : latest && latest.fromId === me
          ? 'You: '
          : '';
    const preview = matchSnippet
      ? `Match: ${matchSnippet}`
      : latest
        ? `${who}${latest.attachment ? '📎 ' : ''}${previewText(latest.text)}`
        : isFamily
          ? 'Everyone in the household'
          : 'No messages yet — say hello!';

    return (
      <button
        key={row.memberId}
        type="button"
        onClick={() => selectConversation(row.memberId)}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
          selected ? 'bg-accent/12 text-fg' : 'hover:bg-nav-hover text-fg',
        )}
      >
        <div className="relative shrink-0">
          {isFamily ? (
            <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>
          ) : (
            member && <Avatar {...member} size="md" />
          )}
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center border-2 border-surface">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('font-semibold truncate text-sm', unread > 0 && 'text-accent')}>
              {isFamily ? 'Family' : member!.name}
            </span>
            {!isFamily && pinnedIds.includes(row.memberId) && (
              <Pin className="w-3 h-3 text-faint shrink-0" aria-label="Pinned" />
            )}
            {latest && (
              <span className="ml-auto shrink-0 text-[11px] text-faint">
                {formatListTime(latest.timestamp)}
              </span>
            )}
          </div>
          <p
            className={cn(
              'text-xs truncate mt-0.5',
              unread > 0 ? 'text-fg-secondary font-medium' : 'text-muted',
            )}
          >
            {isFamily && !latest ? memberNamesLine || preview : preview}
          </p>
        </div>
      </button>
    );
  };

  if (others.length === 0) {
    return (
      <div className="h-full p-4">
        <EmptyState
          icon={MessageCircle}
          title="No one to message"
          description="Add family members first."
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full flex overflow-hidden bg-elevated">
      <aside
        className={cn(
          'w-full sm:w-[19rem] lg:w-[21rem] shrink-0 border-r border-border bg-surface flex flex-col',
          mobileListOpen ? 'flex' : 'hidden sm:flex',
        )}
      >
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
              <p className="text-xs text-muted mt-0.5">Private family conversations</p>
            </div>
            <MessageCircle className="w-5 h-5 text-accent shrink-0" />
          </div>
          <label className="relative block mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages"
              className="pl-9 h-10"
              aria-label="Search messages"
            />
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-3">
          {filteredConversations.length === 0 ? (
            <p className="text-sm text-muted px-3 py-6 text-center">
              {search.trim() ? 'No conversations match that search.' : 'No conversations yet.'}
            </p>
          ) : (
            <>
              {pinnedRows.length > 0 && (
                <div>
                  <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1">
                    <Pin className="w-3 h-3" /> Pinned
                  </div>
                  <div className="space-y-0.5">{pinnedRows.map(renderConvButton)}</div>
                </div>
              )}
              <div>
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  {pinnedRows.length > 0 ? 'Conversations' : 'All conversations'}
                </div>
                <div className="space-y-0.5">
                  {(pinnedRows.length > 0 ? unpinnedRows : filteredConversations).map(
                    renderConvButton,
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      <section
        className={cn(
          'min-w-0 flex-1 flex flex-col bg-page',
          mobileListOpen ? 'hidden sm:flex' : 'flex',
        )}
      >
        {chatId ? (
          <>
            <header className="shrink-0 h-[4.5rem] px-4 sm:px-6 border-b border-border bg-elevated flex items-center gap-3">
              <button
                type="button"
                className="sm:hidden p-2 -ml-2 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                onClick={() => setMobileListOpen(true)}
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              {isFamilyChat ? (
                <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
                  <Home className="w-5 h-5" />
                </div>
              ) : (
                chatPartner && <Avatar {...chatPartner} size="md" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{isFamilyChat ? 'Family' : chatPartner?.name}</p>
                <p className="text-xs text-muted truncate">
                  {isFamilyChat ? (memberNamesLine || 'Everyone in the household') : 'Private conversation'}
                </p>
              </div>
              {!isFamilyChat && chatPartner && (
                <button
                  type="button"
                  title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                  onClick={() => togglePin(chatPartner.id)}
                  className={cn(
                    'p-2 rounded-xl border border-border hover:bg-nav-hover',
                    isPinned ? 'text-accent' : 'text-muted',
                  )}
                >
                  {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
              )}
            </header>

            <div ref={threadScrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 space-y-1">
              {thread.length === 0 ? (
                <p className="text-center text-sm text-muted py-12">
                  {isFamilyChat
                    ? 'No family messages yet. Say something everyone can see!'
                    : `No messages yet. Say hello to ${chatPartner?.name}!`}
                </p>
              ) : (
                threadItems.map((item) => {
                  if (item.kind === 'day') {
                    return (
                      <div key={`day-${item.key}`} className="flex justify-center py-3">
                        <span className="text-[11px] font-medium text-faint bg-surface/80 border border-border px-3 py-1 rounded-full">
                          {item.label}
                        </span>
                      </div>
                    );
                  }
                  const { msg, showAvatar, showTime } = item;
                  const mine = msg.fromId === me;
                  const sender = getMember(msg.fromId) || (mine ? meLook : chatPartner);
                  const bubble = sender?.color || (mine ? '#6366f1' : '#64748b');
                  const ink = contrastText(bubble);
                  const showName = isFamilyChat && !mine && showAvatar;

                  const quoted = msg.replyToId
                    ? thread.find((m) => m.id === msg.replyToId) ||
                      data.messages.find((m) => m.id === msg.replyToId)
                    : undefined;
                  const quotedName = quoted
                    ? getMember(quoted.fromId)?.name || 'Someone'
                    : '';
                  const reactionEntries = Object.entries(msg.reactions || {}).filter(
                    ([, ids]) => ids.length > 0,
                  );

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'group flex gap-2 max-w-[min(100%,28rem)]',
                        mine ? 'ml-auto flex-row-reverse' : 'mr-auto',
                        showAvatar ? 'mt-3' : 'mt-0.5',
                      )}
                    >
                      <div className={cn('w-8 shrink-0', !showAvatar && 'invisible')}>
                        {showAvatar && sender && <Avatar {...sender} size="sm" />}
                      </div>
                      <div className={cn('min-w-0 relative', mine ? 'items-end' : 'items-start')}>
                        <div
                          className={cn(
                            'px-3 py-2 text-sm leading-snug shadow-sm',
                            mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md',
                          )}
                          style={{ backgroundColor: bubble, color: ink }}
                        >
                          {showName && (
                            <div className="text-[11px] font-semibold mb-0.5 opacity-90">
                              {sender?.name || 'Someone'}
                            </div>
                          )}
                          {quoted && (
                            <div
                              className="mb-1.5 pl-2 border-l-2 text-xs opacity-90"
                              style={{ borderColor: ink }}
                            >
                              <span className="font-semibold">{quotedName}</span>
                              <div className="truncate opacity-80">{previewText(quoted.text, 60)}</div>
                            </div>
                          )}
                          {!msg.attachment && <MessageBody text={msg.text} />}
                          {msg.attachment && (
                            <>
                              {msg.text && msg.text !== msg.attachment.title && (
                                <div className="mb-1">
                                  <MessageBody text={msg.text} />
                                </div>
                              )}
                              <AttachmentCard
                                att={msg.attachment}
                                onOpen={() => openAttachment(msg.attachment!)}
                              />
                            </>
                          )}
                        </div>

                        {reactionEntries.length > 0 && (
                          <div
                            className={cn(
                              'flex flex-wrap gap-1 mt-0.5',
                              mine ? 'justify-end' : 'justify-start',
                            )}
                          >
                            {reactionEntries.map(([emoji, ids]) => (
                              <button
                                key={emoji}
                                type="button"
                                title={ids.map((id) => getMember(id)?.name || id).join(', ')}
                                onClick={() => void toggleMessageReaction(msg.id, emoji)}
                                className={cn(
                                  'text-[11px] px-1.5 py-0.5 rounded-full border border-border bg-surface/90',
                                  ids.includes(me) && 'ring-1 ring-accent',
                                )}
                              >
                                {emoji}
                                {ids.length > 1 ? ` ${ids.length}` : ''}
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={cn(
                            'flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
                            mine ? 'justify-end' : 'justify-start',
                          )}
                        >
                          <button
                            type="button"
                            title="Reply"
                            className="p-1 rounded-md text-faint hover:text-fg hover:bg-nav-hover"
                            onClick={() => {
                              setReplyTo(msg);
                              setReactForId(null);
                              inputRef.current?.focus();
                            }}
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="React"
                            className="p-1 rounded-md text-faint hover:text-fg hover:bg-nav-hover"
                            onClick={() =>
                              setReactForId((id) => (id === msg.id ? null : msg.id))
                            }
                          >
                            <SmilePlus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {reactForId === msg.id && (
                          <div
                            className={cn(
                              'flex gap-1 mt-1 p-1 rounded-xl border border-border bg-elevated shadow-sm',
                              mine ? 'justify-end' : 'justify-start',
                            )}
                          >
                            {REACTION_EMOJI.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="text-base px-1.5 py-0.5 rounded-lg hover:bg-nav-hover"
                                onClick={() => {
                                  void toggleMessageReaction(msg.id, emoji);
                                  setReactForId(null);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {showTime && (
                          <p
                            className={cn(
                              'text-[10px] mt-0.5 px-1 text-faint',
                              mine ? 'text-right' : 'text-left',
                            )}
                          >
                            {formatMessageTime(msg.timestamp)}
                            {mine && (
                              <span className="ml-1 opacity-80">
                                {msg.read ? ' · Read' : ' · Sent'}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-border bg-elevated px-3 sm:px-4 py-3">
              {replyTo && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-border bg-inset/50 px-3 py-2">
                  <Reply className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-fg">
                      Replying to {getMember(replyTo.fromId)?.name || 'message'}
                    </p>
                    <p className="text-xs text-muted truncate">{previewText(replyTo.text, 80)}</p>
                  </div>
                  <button
                    type="button"
                    className="p-1 rounded-md text-muted hover:text-fg"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel reply"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {(uploading || uploadError) && (
                <p
                  className={cn(
                    'text-xs px-1 pb-1.5',
                    uploadError ? 'text-warn' : 'text-muted',
                  )}
                >
                  {uploading ? 'Uploading photo\u2026' : uploadError}
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
                    const file = e.target.files?.[0];
                    if (file) void uploadPhoto(file);
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
                <button
                  type="button"
                  title="Share GreenHQ item"
                  onClick={() => {
                    setShareOpen(true);
                    setShareType(null);
                  }}
                  className="p-2.5 rounded-xl border border-border text-muted hover:text-fg hover:bg-nav-hover"
                >
                  <Link2 className="w-5 h-5" />
                </button>
                <Input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    isFamilyChat
                      ? 'Message Family…'
                      : `Message ${chatPartner?.name || ''}…`
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  className="flex-1 text-base min-h-11"
                  disabled={uploading}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || uploading || !text.trim()}
                  className="p-2.5 rounded-xl bg-accent text-accent-ink hover:bg-accent disabled:opacity-50 shrink-0"
                  title="Send message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted">
            Select a conversation
          </div>
        )}
      </section>

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-elevated shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold">
                {shareType ? `Share ${shareType}` : 'Share GreenHQ item'}
              </h2>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-nav-hover"
                onClick={() => {
                  setShareOpen(false);
                  setShareType(null);
                  setShareError('');
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {shareError && (
              <div className="px-4 py-2 text-xs text-red-500 border-b border-border bg-red-500/5">
                {shareError}
              </div>
            )}
            <div className="overflow-y-auto p-3 space-y-2">
              {!shareType && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['todo', 'Task', ListTodo],
                      ['event', 'Event', Calendar],
                      ['note', 'Note', StickyNote],
                      ['shopping', 'Shopping', ShoppingCart],
                      ['quest', 'Quest', Swords],
                    ] as const
                  ).map(([type, label, Icon]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setShareType(type)}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-3 hover:bg-nav-hover text-left"
                    >
                      <Icon className="w-4 h-4 text-accent" />
                      <span className="font-medium text-sm">{label}</span>
                    </button>
                  ))}
                </div>
              )}
              {shareType === 'todo' &&
                data.todos
                  .filter((t) => !t.completed && t.status !== 'done')
                  .slice(0, 40)
                  .map((todo) => (
                    <button
                      key={todo.id}
                      type="button"
                      className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-nav-hover"
                      onClick={() =>
                        void shareAttachment({
                          type: 'todo',
                          id: todo.id,
                          title: todo.text,
                          ...withSubtitle(
                            todo.dueAt
                              ? `Due ${new Date(todo.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                              : undefined,
                          ),
                        })
                      }
                    >
                      <div className="font-medium text-sm">{todo.text}</div>
                      {todo.dueAt && (
                        <div className="text-xs text-muted mt-0.5">
                          Due {new Date(todo.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      )}
                    </button>
                  ))}
              {shareType === 'event' &&
                data.events.slice(0, 40).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-nav-hover"
                    onClick={() =>
                      void shareAttachment({
                        type: 'event',
                        id: ev.id,
                        title: ev.title,
                        ...withSubtitle(
                          ev.start
                            ? new Date(ev.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                            : undefined,
                        ),
                      })
                    }
                  >
                    <div className="font-medium text-sm">{ev.title}</div>
                  </button>
                ))}
              {shareType === 'note' &&
                data.notes.slice(0, 40).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-nav-hover"
                    onClick={() =>
                      void shareAttachment({
                        type: 'note',
                        id: n.id,
                        title: n.title || 'Note',
                        ...withSubtitle(n.content?.slice(0, 60)),
                      })
                    }
                  >
                    <div className="font-medium text-sm">{n.title || 'Note'}</div>
                  </button>
                ))}
              {shareType === 'shopping' &&
                data.shopping
                  .filter((s) => !s.bought)
                  .slice(0, 40)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-nav-hover"
                      onClick={() =>
                        void shareAttachment({
                          type: 'shopping',
                          id: s.id,
                          title: s.text || 'Item',
                          ...withSubtitle(s.store || s.category),
                        })
                      }
                    >
                      <div className="font-medium text-sm">{s.text}</div>
                    </button>
                  ))}
              {shareType === 'quest' &&
                data.chores
                  .filter((q) => q.status === 'open' || q.status === 'pending')
                  .slice(0, 40)
                  .map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-nav-hover"
                      onClick={() =>
                        void shareAttachment({
                          type: 'quest',
                          id: q.id,
                          title: q.title,
                          subtitle: `+${q.xp} XP · +${q.coins} coins`,
                        })
                      }
                    >
                      <div className="font-medium text-sm">{q.title}</div>
                    </button>
                  ))}
              {shareType && (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-fg px-1 py-2"
                  onClick={() => setShareType(null)}
                >
                  ← Back to types
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
