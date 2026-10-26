"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Listens on private, content-free broadcast channels (org + own user) and
 * re-renders the current page from the server, so every surface — dashboard,
 * inbox, task pages and the 3D office — re-reads the same RLS-scoped data.
 * Every signal is also re-dispatched as a window "vo:realtime" event so other
 * client widgets (the chat) can react without opening a second channel.
 * Chat signals only refetch the chat feed; they do not refresh the page.
 */
export const REALTIME_EVENT = "vo:realtime";
export function RealtimeRefresher({ orgId, userId }: { orgId: string; userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (message: { payload?: { entity?: string } }) => {
      const entity = message.payload?.entity;
      window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { entity } }));
      if (entity === "chat") return;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      for (const topic of [`org:${orgId}`, `user:${userId}`]) {
        channels.push(supabase.channel(topic, { config: { private: true } }).on("broadcast", { event: "changed" }, refresh).subscribe());
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const c of channels) supabase.removeChannel(c);
    };
  }, [orgId, userId, router]);

  return null;
}
