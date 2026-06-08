import Link from "next/link";
import { getAdminUserDetail } from "@/lib/admin-db";
import { KpiCard, BarChart, ChartCard, formatMoney, formatTokens, formatNumber, formatDate, timeAgo, statusBadge } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  const { phone: rawPhone } = await params;
  const phone = decodeURIComponent(rawPhone);
  const { user, analytics, daily } = await getAdminUserDetail(phone);

  const a = analytics as Record<string, number | string | null> | null;
  const totalTokens = a
    ? Number(a.total_input_tokens || 0) +
      Number(a.total_output_tokens || 0) +
      Number(a.total_cache_creation_tokens || 0) +
      Number(a.total_cache_read_tokens || 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-ink/50 hover:text-ink">
          ← All users
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{(user?.full_name as string) || phone}</h1>
          {statusBadge((user?.status as string) || null)}
        </div>
        <p className="mt-1 text-sm text-ink/50">
          {phone}
          {user?.email ? ` · ${user.email as string}` : ""}
          {user?.business_type ? ` · ${user.business_type as string}` : ""}
          {user?.signup_date ? ` · signed up ${formatDate(user.signup_date as string)}` : " · never signed up on website"}
          {user?.promo_code_used ? ` · promo ${user.promo_code_used as string}` : ""}
        </p>
      </div>

      {a ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Messages in" value={formatNumber(Number(a.total_messages_in || 0))} />
            <KpiCard label="Tasks" value={formatNumber(Number(a.total_tasks || 0))} sub={`${a.completed_tasks || 0} ok · ${a.failed_tasks || 0} failed`} />
            <KpiCard label="Total tokens" value={formatTokens(totalTokens)} />
            <KpiCard label="Output tokens" value={formatTokens(Number(a.total_output_tokens || 0))} />
            <KpiCard label="Total cost" value={formatMoney(Number(a.total_cost_usd || 0))} accent="indigo" />
            <KpiCard label="Last active" value={timeAgo(a.last_activity_at as string)} sub={`first ${formatDate(a.first_activity_at as string)}`} />
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Messages per day (90d)">
              <BarChart data={daily.map((d) => ({ label: d.date, value: d.messagesIn }))} />
            </ChartCard>
            <ChartCard title="Cost per day (90d)">
              <BarChart
                data={daily.map((d) => ({ label: d.date, value: Math.round(d.costUsd * 100) / 100 }))}
                valueFormatter={(v) => formatMoney(v)}
                color="var(--color-warning)"
              />
            </ChartCard>
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-ink/10 bg-white p-8 text-center text-ink/50">
          Signed up but never messaged the bot — no usage recorded.
        </div>
      )}
    </div>
  );
}
