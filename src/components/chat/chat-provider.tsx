"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_EVENT } from "@/components/realtime-refresher";
import { STICKER_ART } from "@/lib/office/catalog";
import { playChime } from "@/lib/office/sounds";
import type { SceneEmote } from "@/components/office/office-scene";

/** One row of public.chat_feed(): anonymous rows carry no sender information. */
export type ChatMessage = {
  id: string;
  kind: "text" | "sticker" | "image";
  body: string | null;
  sticker: string | null;
  media_path: string | null;
  is_anonymous: boolean;
  is_mine: boolean;
  sender_id: string | null;
  sender_name: string | null;
  mentions_me: boolean;
  created_at: string;
  expires_at: string;
  reactions: Record<string, number>;
  my_reactions: string[];
};

export type ChatPrefs = { sound: boolean; effects: boolean; reduceMotion: boolean };

type ChatState = {
  orgId: string;
  viewerId: string;
  isAdmin: boolean;
  messages: ChatMessage[];
  unread: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  prefs: ChatPrefs;
  setPrefs: (p: Partial<Pick<ChatPrefs, "sound" | "effects">>) => Promise<void>;
  emotes: SceneEmote[];
  dismissEmote: (id: string) => void;
  petAlert: boolean;
};

const ChatContext = createContext<ChatState | null>(null);

export function useChat(): ChatState | null {
  return useContext(ChatContext);
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️){1,8}$/u;

function emoteFor(m: ChatMessage): string | null {
  if (m.kind === "sticker" && m.sticker) return STICKER_ART[m.sticker as keyof typeof STICKER_ART] ?? null;
  if (m.kind === "text" && m.body && EMOJI_ONLY.test(m.body.trim())) return m.body.trim();
  return null;
}

/**
 * Chat state for the whole app shell. The feed is read through the
 * chat_feed() RPC (which never returns anonymous senders); updates arrive as
 * content-free realtime signals re-dispatched by RealtimeRefresher.
 */
export function ChatProvider({
  children,
  orgId,
  viewerId,
  isAdmin,
  initialPrefs,
  unreadMentions,
}: {
  children: ReactNode;
  orgId: string;
  viewerId: string;
  isAdmin: boolean;
  initialPrefs: ChatPrefs;
  /** Unread @mention notifications (tasks + chat) — drives the pet alert. */
  unreadMentions: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpenState] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState(initialPrefs);
  const [emotes, setEmotes] = useState<SceneEmote[]>([]);
  const known = useRef<Set<string> | null>(null);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc("chat_feed", { p_limit: 80 });
    const rows = (data ?? []) as ChatMessage[];
    const seen = known.current;
    if (seen) {
      const fresh = rows.filter((m) => !seen.has(m.id) && !m.is_mine && Date.now() - new Date(m.created_at).getTime() < 20_000);
      if (prefsRef.current.effects) {
        const next = fresh.flatMap((m) => {
          const text = emoteFor(m);
          return text ? [{ id: m.id, text, userId: m.is_anonymous ? null : m.sender_id }] : [];
        });
        if (next.length) setEmotes((e) => [...e, ...next].slice(-12));
      }
      if (prefsRef.current.sound && fresh.some((m) => m.mentions_me)) playChime();
    }
    known.current = new Set(rows.map((m) => m.id));
    setMessages(rows);
  }, [supabase]);

  useEffect(() => {
    // Initial load; later loads come from realtime signals.
    void refresh();
    const onSignal = (e: Event) => {
      if ((e as CustomEvent<{ entity?: string }>).detail?.entity === "chat") void refresh();
    };
    window.addEventListener(REALTIME_EVENT, onSignal);
    // Expired messages disappear even without new activity.
    const tick = setInterval(() => setMessages((rows) => rows.filter((m) => new Date(m.expires_at) > new Date())), 60_000);
    return () => {
      window.removeEventListener(REALTIME_EVENT, onSignal);
      clearInterval(tick);
    };
  }, [refresh]);

  const setOpen = useCallback(
    (value: boolean) => {
      setOpenState(value);
      if (value) setLastSeen(new Date().toISOString());
    },
    [],
  );

  const setPrefs = useCallback(
    async (p: Partial<Pick<ChatPrefs, "sound" | "effects">>) => {
      setPrefsState((prev) => ({ ...prev, ...p }));
      const update: { sound_enabled?: boolean; chat_effects?: boolean } = {};
      if (p.sound !== undefined) update.sound_enabled = p.sound;
      if (p.effects !== undefined) update.chat_effects = p.effects;
      await supabase.from("profiles").update(update).eq("id", viewerId);
    },
    [supabase, viewerId],
  );

  const unread = open ? 0 : messages.filter((m) => !m.is_mine && (!lastSeen || m.created_at > lastSeen)).length;
  const value: ChatState = {
    orgId,
    viewerId,
    isAdmin,
    messages,
    unread,
    open,
    setOpen,
    refresh,
    prefs,
    setPrefs,
    emotes,
    dismissEmote: (id) => setEmotes((e) => e.filter((x) => x.id !== id)),
    petAlert: unreadMentions > 0,
  };
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
