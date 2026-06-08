// Shared server components + formatters for the admin dashboard.
import React from "react";

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || n === 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatUptime(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "green" | "red" | "indigo";
}) {
  const accentClass =
    accent === "green"
      ? "text-success"
      : accent === "red"
        ? "text-danger"
        : accent === "indigo"
          ? "text-primary"
          : "text-ink";
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink/50">{sub}</div>}
    </div>
  );
}

export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-success" : "bg-danger"} ${ok ? "" : "animate-pulse"}`}
      />
      {label}
    </span>
  );
}

/**
 * Server-rendered SVG bar chart. Zero client JS — each bar carries a
 * <title> tooltip with the exact value.
 */
export function BarChart({
  data,
  height = 120,
  color = "var(--color-primary)",
  valueFormatter = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (data.length === 0) {
    return <div className="flex h-24 items-center justify-center text-sm text-ink/40">No data yet</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 100 / data.length;
  // Show ~6 x-axis labels max
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max((d.value / max) * (height - 4), 1.5);
          return (
            <rect
              key={i}
              x={i * barW + barW * 0.15}
              y={height - h}
              width={barW * 0.7}
              height={h}
              rx={0.5}
              fill={color}
              opacity={0.85}
            >
              <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink/40">
        {data
          .filter((_, i) => i % labelEvery === 0)
          .map((d, i) => (
            <span key={i}>{d.label.length > 7 ? d.label.slice(5) : d.label}</span>
          ))}
      </div>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink/70">{title}</h3>
      {children}
    </div>
  );
}

export function statusBadge(status: string | null): React.ReactNode {
  if (!status) {
    return <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/60">bot only</span>;
  }
  const cls =
    status === "active"
      ? "bg-success/10 text-success"
      : status === "trial"
        ? "bg-warning/10 text-warning"
        : "bg-ink/10 text-ink/60";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}
