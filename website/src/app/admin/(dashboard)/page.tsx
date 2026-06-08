import Link from "next/link";
import { getOverviewStats, getDailySeries, getMonthlySeries, getBotHealth, getAdminUsers } from "@/lib/admin-db";
import { KpiCard, BarChart, ChartCard, StatusDot, formatMoney, formatTokens, formatNumber, timeAgo } from "../ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [stats, daily, monthly, health, users] = await Promise.all([
    getOverviewStats(),
    getDailySeries(60),
    getMonthlySeries(12),
    getBotHealth(),
    getAdminUsers(),
  ]);

  const botUp = !!health && !health.isStale;
  const topSpenders = users.filter((u) => u.costUsd > 0).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <StatusDot ok={botUp} label={botUp ? `Bot online · heartbeat ${timeAgo(health!.reportedAt)}` : "Bot offline / no heartbeat"} />
      </div>

      {/* Growth */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Growth</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total users" value={formatNumber(stats.totalUsers)} sub={`${stats.activeStatusUsers} active status`} />
          <KpiCard label="New today" value={stats.newToday} accent={stats.newToday > 0 ? "green" : undefined} />
          <KpiCard label="New this week" value={stats.newThisWeek} />
          <KpiCard label="New this month" value={stats.newThisMonth} />
          <KpiCard label="New this quarter" value={stats.newThisQuarter} />
          <KpiCard label="Reached bot" value={formatNumber(users.filter((u) => u.messagesIn > 0).length)} sub="ever sent a message" />
        </div>
      </section>

      {/* Engagement */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Engagement</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="DAU" value={stats.dau} accent="indigo" sub="active today" />
          <KpiCard label="WAU" value={stats.wau} sub="last 7 days" />
          <KpiCard label="MAU" value={stats.mau} sub="last 30 days" />
          <KpiCard label="Stickiness" value={stats.mau > 0 ? `${Math.round((stats.dau / stats.mau) * 100)}%` : "—"} sub="DAU / MAU" />
          <KpiCard label="Messages today" value={formatNumber(stats.messagesToday)} />
          <KpiCard label="Tasks today" value={formatNumber(stats.tasksToday)} />
        </div>
      </section>

      {/* Cost */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Cost & tokens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Cost today" value={formatMoney(stats.costToday)} />
          <KpiCard label="Cost this month" value={formatMoney(stats.costThisMonth)} />
          <KpiCard label="Tokens this month" value={formatTokens(stats.tokensThisMonth)} />
          <KpiCard label="Cost all-time" value={formatMoney(stats.costAllTime)} />
        </div>
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Active users per day (60d)">
          <BarChart data={daily.map((d) => ({ label: d.date, value: d.activeUsers }))} />
        </ChartCard>
        <ChartCard title="Signups per day (60d)">
          <BarChart data={daily.map((d) => ({ label: d.date, value: d.signups }))} color="var(--color-accent)" />
        </ChartCard>
        <ChartCard title="Cost per day (60d)">
          <BarChart
            data={daily.map((d) => ({ label: d.date, value: Math.round(d.costUsd * 100) / 100 }))}
            valueFormatter={(v) => formatMoney(v)}
            color="var(--color-warning)"
          />
        </ChartCard>
        <ChartCard title="Signups per month (12mo)">
          <BarChart data={monthly.map((m) => ({ label: m.month, value: m.signups }))} color="var(--color-accent)" />
        </ChartCard>
      </section>

      {/* Top spenders */}
      <ChartCard title="Top users by all-time cost">
        <table className="w-full text-sm">
          <tbody>
            {topSpenders.map((u) => (
              <tr key={u.phone} className="border-t border-ink/5">
                <td className="py-2">
                  <Link href={`/admin/users/${encodeURIComponent(u.phone)}`} className="font-medium text-primary hover:underline">
                    {u.fullName || u.phone}
                  </Link>
                </td>
                <td className="py-2 text-ink/60">{u.phone}</td>
                <td className="py-2 text-right">{formatTokens(u.totalTokens)} tok</td>
                <td className="py-2 text-right font-medium">{formatMoney(u.costUsd)}</td>
                <td className="py-2 text-right text-ink/50">{timeAgo(u.lastActivityAt as string | null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}
