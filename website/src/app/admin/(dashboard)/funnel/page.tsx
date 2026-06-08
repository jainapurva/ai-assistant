import Link from "next/link";
import { getFunnelStats } from "@/lib/admin-db";
import { ChartCard, formatMoney, formatDate, timeAgo } from "../../ui";

export const dynamic = "force-dynamic";

function FunnelBar({ label, value, max, pctOf }: { label: string; value: number; max: number; pctOf?: number }) {
  const width = max > 0 ? Math.max((value / max) * 100, 2) : 2;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-ink/70">{label}</span>
        <span className="font-medium">
          {value}
          {pctOf != null && pctOf > 0 && (
            <span className="ml-1 text-xs text-ink/40">({Math.round((value / pctOf) * 100)}%)</span>
          )}
        </span>
      </div>
      <div className="h-6 rounded bg-ink/5">
        <div className="h-6 rounded bg-primary/80" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default async function AdminFunnelPage() {
  const f = await getFunnelStats();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Funnel & Retention</h1>

      <ChartCard title="Activation funnel (website signups)">
        <div className="space-y-4">
          <FunnelBar label="Signed up" value={f.signedUp} max={f.signedUp} />
          <FunnelBar label="Sent ≥1 message to the bot" value={f.reachedBot} max={f.signedUp} pctOf={f.signedUp} />
          <FunnelBar label="Repeat users (active ≥2 days)" value={f.repeatUsers} max={f.signedUp} pctOf={f.signedUp} />
          <FunnelBar label="Active in last 7 days" value={f.activeLast7d} max={f.signedUp} pctOf={f.signedUp} />
        </div>
        <p className="mt-3 text-xs text-ink/40">
          Repeat/active rates are based on daily usage data; days before the dashboard backfill window may undercount.
        </p>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`Trials expiring in 14 days (${f.trialsExpiringSoon.length})`}>
          {f.trialsExpiringSoon.length === 0 ? (
            <p className="text-sm text-ink/40">None</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {f.trialsExpiringSoon.map((t) => (
                  <tr key={t.phone} className="border-t border-ink/5">
                    <td className="py-2">
                      <Link href={`/admin/users/${encodeURIComponent(t.phone)}`} className="text-primary hover:underline">
                        {t.fullName || t.phone}
                      </Link>
                    </td>
                    <td className="py-2 text-ink/60">{t.phone}</td>
                    <td className="py-2 text-right text-warning">{formatDate(t.trialExpiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>

        <ChartCard title={`Promo code performance`}>
          {f.promoCodes.length === 0 ? (
            <p className="text-sm text-ink/40">No promo codes</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink/40">
                  <th className="py-1">Code</th>
                  <th className="py-1 text-right">Trial days</th>
                  <th className="py-1 text-right">Signups</th>
                  <th className="py-1 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {f.promoCodes.map((p) => (
                  <tr key={p.code} className="border-t border-ink/5">
                    <td className="py-2 font-mono font-medium">{p.code}</td>
                    <td className="py-2 text-right">{p.trialDays}</td>
                    <td className="py-2 text-right font-medium">{p.uses}</td>
                    <td className="py-2 text-right text-ink/60">{p.usesRemaining ?? "∞"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>

      <ChartCard title={`Dormant users — no activity in 14+ days (${f.dormantUsers.length})`}>
        {f.dormantUsers.length === 0 ? (
          <p className="text-sm text-ink/40">None — everyone's active 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {f.dormantUsers.map((d) => (
                <tr key={d.phone} className="border-t border-ink/5">
                  <td className="py-2">
                    <Link href={`/admin/users/${encodeURIComponent(d.phone)}`} className="text-primary hover:underline">
                      {d.fullName || d.phone}
                    </Link>
                  </td>
                  <td className="py-2 text-ink/60">{d.phone}</td>
                  <td className="py-2 text-right text-ink/60">spent {formatMoney(d.costUsd)}</td>
                  <td className="py-2 text-right text-danger">{timeAgo(d.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>
    </div>
  );
}
