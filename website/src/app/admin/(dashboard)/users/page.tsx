import Link from "next/link";
import { getAdminUsers } from "@/lib/admin-db";
import { formatMoney, formatTokens, formatNumber, formatDate, timeAgo, statusBadge } from "../../ui";

export const dynamic = "force-dynamic";

const SORTS: Record<string, (a: AdminUser, b: AdminUser) => number> = {
  cost: (a, b) => b.costUsd - a.costUsd,
  cost7d: (a, b) => b.cost7d - a.cost7d,
  tokens: (a, b) => b.totalTokens - a.totalTokens,
  messages: (a, b) => b.messagesIn - a.messagesIn,
  recent: (a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""),
  signup: (a, b) => (b.signupDate || "").localeCompare(a.signupDate || ""),
};
type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>[number];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort = "cost" } = await searchParams;
  const users = await getAdminUsers();
  users.sort(SORTS[sort] || SORTS.cost);

  const sortLink = (key: string, label: string) => (
    <Link
      href={`/admin/users?sort=${key}`}
      className={sort === key ? "font-semibold text-primary" : "text-ink/50 hover:text-ink"}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Users ({users.length})</h1>
        <div className="flex gap-3 text-sm">
          <span className="text-ink/40">Sort:</span>
          {sortLink("cost", "Cost")}
          {sortLink("cost7d", "Cost 7d")}
          {sortLink("tokens", "Tokens")}
          {sortLink("messages", "Messages")}
          {sortLink("recent", "Recent")}
          {sortLink("signup", "Newest")}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3 text-right">Msgs</th>
              <th className="px-4 py-3 text-right">Tasks</th>
              <th className="px-4 py-3 text-right">Active days</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Cost 7d</th>
              <th className="px-4 py-3 text-right">Last active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.phone} className="border-t border-ink/5 hover:bg-cream/50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/users/${encodeURIComponent(u.phone)}`} className="block">
                    <span className="font-medium text-primary hover:underline">{u.fullName || "—"}</span>
                    <span className="block text-xs text-ink/50">{u.phone}</span>
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  {statusBadge(u.status)}
                  {u.trialExpiresAt && new Date(u.trialExpiresAt) > new Date() && (
                    <span className="ml-1 text-xs text-warning">trial</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink/60">{formatDate(u.signupDate)}</td>
                <td className="px-4 py-2.5 text-right">{formatNumber(u.messagesIn)}</td>
                <td className="px-4 py-2.5 text-right">{formatNumber(u.tasks)}</td>
                <td className="px-4 py-2.5 text-right">{u.activeDays}</td>
                <td className="px-4 py-2.5 text-right">{formatTokens(u.totalTokens)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatMoney(u.costUsd)}</td>
                <td className="px-4 py-2.5 text-right">{u.cost7d > 0 ? formatMoney(u.cost7d) : "—"}</td>
                <td className="px-4 py-2.5 text-right text-ink/60">{timeAgo(u.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
