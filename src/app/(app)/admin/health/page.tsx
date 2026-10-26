import { Badge, Card, EmptyState } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";

export const metadata = { title: "System health" };

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Job observability for Admins: last run per scheduled job, failures, backlog. */
export default async function HealthPage() {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const weekAgo = daysAgoIso(7);
  const [{ data: runs }, { count: failures }] = await Promise.all([
    // RLS: job_runs is readable by Admins only.
    supabase.from("job_runs").select("id, job, started_at, finished_at, status, affected, error").order("started_at", { ascending: false }).limit(60),
    supabase.from("job_runs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("started_at", weekAgo),
  ]);
  // Tombstones have no user grants; the count is read with the service role after the Admin check above.
  const { count: pendingMedia } = await createAdminClient().from("chat_media_tombstones").select("path", { count: "exact", head: true });

  const latest = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (!latest.has(r.job)) latest.set(r.job, r);
  const jobs = Object.keys(t.health.names);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{t.health.title}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const r = latest.get(job);
          return (
            <Card key={job} className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.health.names[job]}</span>
              {r ? (
                <>
                  <span className="text-xs text-muted">
                    {t.health.lastRun}: {formatBangkok(r.started_at, viewer.locale)}
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <Badge tone={r.status === "succeeded" ? "ok" : r.status === "failed" ? "danger" : "warning"}>
                      {r.status === "succeeded" ? "✓" : r.status === "failed" ? "✕" : "…"} {r.status}
                    </Badge>
                    {t.health.affected}: {r.affected ?? 0}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted">{t.health.none}</span>
              )}
            </Card>
          );
        })}
        <Card className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.health.failures}</span>
          <strong className="text-2xl">{failures ?? 0}</strong>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.health.pendingMedia}</span>
          <strong className="text-2xl">{pendingMedia ?? 0}</strong>
        </Card>
      </div>
      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-2 text-lg font-semibold">{t.health.jobs}</h2>
        {(runs ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState>{t.health.none}</EmptyState>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2">{t.health.job}</th>
                <th className="px-2 py-2">{t.health.started}</th>
                <th className="px-2 py-2">{t.health.status}</th>
                <th className="px-2 py-2 text-right">{t.health.affected}</th>
                <th className="px-5 py-2">{t.health.error}</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-2">{t.health.names[r.job] ?? r.job}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatBangkok(r.started_at, viewer.locale)}</td>
                  <td className="px-2 py-2">
                    <Badge tone={r.status === "succeeded" ? "ok" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Badge>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.affected ?? ""}</td>
                  <td className="px-5 py-2 text-xs text-danger">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
