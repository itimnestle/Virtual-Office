"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_REACTIONS, CHAT_STICKERS } from "@/lib/office/catalog";
import { Artwork } from "@/components/artwork";
import { Icon } from "@/components/icon";
import { artworkForEmote, STICKER_ICON } from "@/lib/office/artwork";
import { format } from "@/lib/i18n/dictionaries";
import { cn } from "@/components/ui";
import { useChat, type ChatMessage } from "./chat-provider";

export type ChatLabels = {
  title: string;
  open: string;
  close: string;
  placeholder: string;
  send: string;
  anonymous: string;
  anonymousName: string;
  anonymousNote: string;
  you: string;
  stickers: string;
  image: string;
  mention: string;
  empty: string;
  retention: string;
  expiresIn: string;
  reveal: string;
  revealed: string;
  mute: string;
  unmute: string;
  mentionsYou: string;
  imageTooLarge: string;
  effects: string;
  errors: Record<string, string>;
};

const MAX_IMAGE = 5 * 1024 * 1024;

function errorText(message: string | undefined, errors: Record<string, string>): string {
  const key = Object.keys(errors).find((k) => message?.includes(k));
  return errors[key ?? "generic"] ?? errors.generic;
}

function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Signed URLs can only be minted while the message is live (Storage RLS).
    void createClient()
      .storage.from("chat-media")
      .createSignedUrl(path, 300)
      .then(({ data }) => alive && setUrl(data?.signedUrl ?? null));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return <span className="block h-24 w-32 animate-pulse rounded-lg bg-surface-2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="max-h-48 max-w-full rounded-lg" loading="lazy" />;
}

function Message({
  m,
  now,
  labels,
  isAdmin,
  onReact,
}: {
  m: ChatMessage;
  now: number;
  labels: ChatLabels;
  isAdmin: boolean;
  onReact: (id: string, emoji: string, on: boolean) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  // The panel clock ticks once a minute, so clamp to the real 24-hour maximum.
  const hours = Math.min(24, Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / 3_600_000)));
  const who = m.is_anonymous ? (m.is_mine ? `${labels.anonymousName} (${labels.you})` : labels.anonymousName) : m.is_mine ? labels.you : m.sender_name;
  const reveal = async () => {
    const { data, error } = await createClient().rpc("admin_chat_identity", { p_message_id: m.id });
    setRevealed(error ? errorText(error.message, labels.errors) : format(labels.revealed, { name: data?.[0]?.sender_name ?? "?" }));
  };
  return (
    <li className={cn("flex flex-col gap-1", m.is_mine && "items-end")}>
      <span className="text-[11px] text-muted">
        {m.is_anonymous && <Artwork name="mask" size={15} className="inline-block align-middle" />}
        {who} · {format(labels.expiresIn, { h: hours })}
        {m.mentions_me ? <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-accent">@{labels.mentionsYou}</span> : null}
      </span>
      <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.is_mine ? "bg-primary/15" : "bg-surface-2")}>
        {m.kind === "sticker" && m.sticker ? (
          <span role="img" aria-label={m.sticker}>
            <Artwork name={STICKER_ICON[m.sticker] ?? "sparkle"} size={64} />
          </span>
        ) : null}
        {m.kind === "image" && m.media_path ? <ChatImage path={m.media_path} /> : null}
        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {CHAT_REACTIONS.map((emoji) => {
          const n = m.reactions[emoji] ?? 0;
          const mine = m.my_reactions.includes(emoji);
          if (!n && !mine) return null;
          return (
            <button key={emoji} type="button" aria-label={`${emoji} ${n}`} onClick={() => onReact(m.id, emoji, !mine)} className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 text-xs", mine ? "border-primary bg-primary/10" : "border-border")}>
              <Artwork name={artworkForEmote(emoji) ?? "smile"} size={18} /> {n}
            </button>
          );
        })}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full px-1.5 text-xs text-muted hover:bg-surface-2" aria-label="+">
            ＋
          </summary>
          <div className="absolute z-10 mt-1 flex gap-1 rounded-xl border border-border bg-surface p-1 shadow">
            {CHAT_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" aria-label={emoji} className="rounded-lg px-1 hover:bg-surface-2" onClick={() => onReact(m.id, emoji, true)}>
                <Artwork name={artworkForEmote(emoji) ?? "smile"} size={24} />
              </button>
            ))}
          </div>
        </details>
        {isAdmin && m.is_anonymous && !m.is_mine ? (
          revealed ? (
            <span className="text-[11px] text-warning">{revealed}</span>
          ) : (
            <button type="button" onClick={reveal} className="text-[11px] text-muted underline">
              {labels.reveal}
            </button>
          )
        ) : null}
      </div>
    </li>
  );
}

/** Floating single-room office chat (bottom-right). */
export function ChatPanel({ labels, people }: { labels: ChatLabels; people: { id: string; name: string }[] }) {
  const chat = useChat();
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const count = chat?.messages.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count, chat?.open]);

  if (!chat) return null;

  const send = async (kind: "text" | "sticker" | "image", extra: { sticker?: string; media?: string } = {}) => {
    setError(null);
    setBusy(true);
    const { error: e } = await supabase.rpc("send_chat_message", {
      p_kind: kind,
      p_body: kind === "text" ? text : undefined,
      p_sticker: extra.sticker,
      p_media_path: extra.media,
      p_anonymous: anonymous,
      p_mentions: mentions,
    });
    setBusy(false);
    if (e) {
      setError(errorText(e.message, labels.errors));
      return;
    }
    if (kind === "text") setText("");
    setMentions([]);
    await chat.refresh();
  };

  const uploadImage = async (file: File) => {
    if (file.size > MAX_IMAGE) {
      setError(labels.imageTooLarge);
      return;
    }
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    // The object name never contains the sender's id (anonymous images stay anonymous).
    const path = `${chat.orgId}/${crypto.randomUUID()}.${ext}`;
    setBusy(true);
    const { error: e } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type });
    setBusy(false);
    if (e) {
      setError(labels.errors.attachment_not_uploaded ?? labels.errors.generic);
      return;
    }
    await send("image", { media: path });
  };

  const react = async (id: string, emoji: string, on: boolean) => {
    await supabase.rpc("react_chat_message", { p_message_id: id, p_emoji: emoji, p_on: on });
    await chat.refresh();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (text.trim()) void send("text");
    }
  };

  if (!chat.open) {
    return (
      <button type="button" className="chat-fab" onClick={() => chat.setOpen(true)} aria-label={labels.open}>
        <Artwork name="chat" size={33} />
        {chat.unread ? <span className="chat-fab-badge">{chat.unread > 9 ? "9+" : chat.unread}</span> : null}
      </button>
    );
  }

  return (
    <section className="chat-panel" aria-label={labels.title}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <strong className="inline-flex items-center gap-2 text-sm"><Artwork name="chat" size={27} />{labels.title}</strong>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-lg px-2 py-1 text-xs hover:bg-surface-2" onClick={() => chat.setPrefs({ sound: !chat.prefs.sound })} aria-pressed={!chat.prefs.sound}>
            <span className="inline-flex items-center gap-1"><Artwork name="notifications" size={20} />{chat.prefs.sound ? labels.mute : labels.unmute}</span>
          </button>
          <button type="button" className="rounded-lg px-2 py-1 text-xs hover:bg-surface-2" onClick={() => chat.setPrefs({ effects: !chat.prefs.effects })} aria-pressed={chat.prefs.effects} title={labels.effects} aria-label={labels.effects}>
            <Artwork name="sparkle" size={22} className={chat.prefs.effects ? undefined : "opacity-40"} />
          </button>
          <button type="button" className="rounded-lg px-2 py-1 text-sm hover:bg-surface-2" onClick={() => chat.setOpen(false)} aria-label={labels.close}>
            <Icon name="close" size={17} />
          </button>
        </div>
      </header>
      <p className="border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] leading-snug text-muted">{labels.retention}</p>
      <ol ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {chat.messages.length === 0 ? <li className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted"><Artwork name="chat" size={48} />{labels.empty}</li> : null}
        {chat.messages.map((m) => (
          <Message key={m.id} m={m} now={now} labels={labels} isAdmin={chat.isAdmin} onReact={react} />
        ))}
      </ol>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {mentions.length ? (
          <div className="flex flex-wrap gap-1">
            {mentions.map((id) => (
              <button key={id} type="button" className="rounded-full bg-primary/15 px-2 text-xs" onClick={() => setMentions(mentions.filter((x) => x !== id))}>
                @{people.find((p) => p.id === id)?.name} ✕
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={1000}
          rows={2}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <details className="chat-stickers relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"><Artwork name="smile" size={19} />{labels.stickers}</summary>
            <div className="chat-sticker-menu">
              {CHAT_STICKERS.map((s) => (
                <button key={s} type="button" className="rounded-lg p-1 text-2xl hover:bg-surface-2" aria-label={s} onClick={() => void send("sticker", { sticker: s })}>
                  <Artwork name={STICKER_ICON[s]} size={30} />
                </button>
              ))}
            </div>
          </details>
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs" onClick={() => fileRef.current?.click()}>
            <Artwork name="image" size={20} />{labels.image}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadImage(f);
            }}
          />
          <select
            className="rounded-lg border border-border bg-surface px-1 py-1 text-xs"
            value=""
            aria-label={labels.mention}
            onChange={(e) => e.target.value && setMentions([...new Set([...mentions, e.target.value])])}
          >
            <option value="">@ {labels.mention}</option>
            {people
              .filter((p) => p.id !== chat.viewerId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void send("text")}
            className="ml-auto rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50"
          >
            {labels.send}
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs" title={labels.anonymousNote}>
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5" />
          <span>
            <Artwork name="mask" size={18} className="inline-block align-middle" /> {labels.anonymous}
            {anonymous ? <span className="block text-[11px] text-muted">{labels.anonymousNote}</span> : null}
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
