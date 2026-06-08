import { getBotHealth } from "@/lib/admin-db";
import { KpiCard, StatusDot, formatUptime, timeAgo } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const h = await getBotHealth();
  const up = !!h && !h.isStale;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">System Health</h1>
        <StatusDot ok={up} label={up ? "Bot online" : "Bot offline"} />
      </div>

      {!h ? (
        <div className="rounded-xl border border-ink/10 bg-white p-8 text-center text-ink/50">
          No heartbeat received yet. The bot pushes health every 5 minutes once deployed.
        </div>
      ) : (
        <>
          {h.isStale && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
              ⚠️ Last heartbeat was {timeAgo(h.reportedAt)} — the bot may be down or the network is unreachable.
            </div>
          )}
          {h.metaTokenOk === false && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
              🔑 Meta access token is failing (OAuth error 190) — WhatsApp messages are not being delivered. Refresh
              META_ACCESS_TOKEN in the bot&apos;s .env.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Last heartbeat" value={timeAgo(h.reportedAt)} accent={up ? "green" : "red"} />
            <KpiCard label="Uptime" value={formatUptime(h.uptimeSecs)} sub={h.startedAt ? `since ${new Date(h.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : undefined} />
            <KpiCard label="Active tasks" value={h.activeTasks ?? "—"} />
            <KpiCard label="Queued messages" value={h.queuedMessages ?? "—"} accent={(h.queuedMessages ?? 0) > 5 ? "red" : undefined} />
            <KpiCard label="Errors (1h)" value={h.errorsLastHour ?? "—"} accent={(h.errorsLastHour ?? 0) > 10 ? "red" : (h.errorsLastHour ?? 0) > 0 ? undefined : "green"} />
            <KpiCard label="Meta token" value={h.metaTokenOk === false ? "EXPIRED" : "OK"} accent={h.metaTokenOk === false ? "red" : "green"} />
          </div>

          <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-ink/70">Raw heartbeat payload</h3>
            <pre className="overflow-x-auto rounded bg-ink/5 p-3 text-xs text-ink/70">
              {JSON.stringify(h.payload, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
