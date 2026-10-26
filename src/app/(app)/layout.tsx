import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { navFor } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { getOfficeSnapshot } from "@/lib/data/office";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { ChatProvider } from "@/components/chat/chat-provider";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorldShell } from "@/components/shell/world-shell";
import "../chat.css";
import "../world.css";
import "../world-polish.css";
import "../world-bright.css";
import "../world-hud.css";
import "../world-game-ui.css";

/**
 * Every signed-in page lives inside the 3D office: the scene is the app shell
 * and each page opens as a window from an object in the room.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const [{ count: unread }, { count: unreadMentions }, { data: people }, state] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .in("kind", ["mentioned", "chat_mentioned"]),
    supabase.from("profiles").select("id, full_name, nickname").eq("is_active", true).order("full_name"),
    // Same authorized query layer as the pages; nothing beyond it reaches the scene.
    getOfficeSnapshot(supabase),
  ]);

  const nav = navFor(viewer.role).map((n) => ({
    key: n.key,
    href: n.href,
    label: t.nav[n.key],
    badge: n.key === "notifications" && unread ? unread : undefined,
  }));

  return (
    <ChatProvider
      orgId={viewer.orgId}
      viewerId={viewer.id}
      isAdmin={viewer.role === "admin"}
      initialPrefs={{ sound: viewer.soundEnabled, effects: viewer.chatEffects, reduceMotion: viewer.reduceMotion }}
      unreadMentions={unreadMentions ?? 0}
    >
      <WorldShell
        nav={nav}
        state={state}
        locale={viewer.locale}
        canAssign={viewer.role === "manager" || viewer.role === "director"}
        viewer={{ name: viewer.nickname ?? viewer.fullName, roleLabel: t.roles[viewer.role], signOut: t.nav.signOut, appName: t.appName }}
        labels={{
          hint: t.office.hint,
          placeholder: t.office.placeholder,
          view2d: t.office.view2d,
          view3d: t.office.view3d,
          fallback: t.office.fallback,
          unassignedBoard: t.office.unassignedBoard,
          locations: t.office.locations,
          absence: t.office.absence,
          roles: t.roles,
          status: t.status,
          open: t.office.open,
          hours: t.office.hours,
          urgent: t.office.urgent,
          inReview: t.office.inReview,
          nextDue: t.office.nextDue,
          noTasks: t.office.noTasks,
          close: t.office.close,
          pet: t.office.pet,
        }}
      >
        {children}
      </WorldShell>
      <RealtimeRefresher orgId={viewer.orgId} userId={viewer.id} />
      <ChatPanel
        labels={{ ...t.chat, effects: t.studio.effects, errors: t.errors }}
        people={(people ?? []).map((p) => ({ id: p.id, name: p.nickname ?? p.full_name }))}
      />
    </ChatProvider>
  );
}
