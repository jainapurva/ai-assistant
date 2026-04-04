"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UserInfo {
  name: string;
  email: string;
  phone: string;
  brokerage?: string;
  license?: string;
  region?: string;
}

interface DashboardData {
  found: boolean;
  message?: string;
  summary: {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    closedWon: number;
    closedLost: number;
    totalProperties: number;
    availableProperties: number;
    soldProperties: number;
    totalShowings: number;
    todaysShowings: number;
    overdueFollowups: number;
    todaysFollowups: number;
    activeCampaigns: number;
    activeTransactions: number;
    activeNurture: number;
    totalValuations: number;
    totalReferrals: number;
    conversionRate: string;
  };
  todaysShowings: { id: string; lead: string; property: string; time: string }[];
  overdueFollowups: { lead: string; date: string; type: string; notes: string }[];
  todaysFollowups: { lead: string; type: string; notes: string }[];
  upcomingDeadlines: { transaction: string; deadline: string; date: string }[];
  recentLeads: {
    id: string; name: string; phone: string; type: string;
    category: string; score: number; status: string;
    source: string; lastContact: string; createdAt: string;
  }[];
  leads: {
    id: string; name: string; phone: string; email: string; type: string;
    category: string; score: number; status: string; source: string;
    lastContact: string; propertyType: string; preferredLocations: string[];
    budgetMin: number; budgetMax: number; timeline: string;
    showingsCount: number; followupsCount: number;
  }[];
  properties: {
    id: string; title: string; type: string; location: string;
    price: number; bedrooms: number; areaSqft: number;
    listingType: string; status: string; showingsCount: number;
  }[];
  campaigns: {
    id: string; name: string; type: string; channels: string[];
    status: string; leadsGenerated: number; createdAt: string;
  }[];
  transactions: {
    id: string; lead: string; property: string;
    salePrice: number; status: string; closeDate: string;
    contractDate: string; pendingDocs: number;
  }[];
}

type Tab = "overview" | "leads" | "properties" | "campaigns" | "transactions";

const CATEGORY_COLORS: Record<string, string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-orange-50 text-orange-700 border-orange-200",
  cold: "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-50 text-slate-600 border-slate-200",
  contacted: "bg-blue-50 text-blue-600 border-blue-200",
  qualified: "bg-indigo-50 text-indigo-600 border-indigo-200",
  showing: "bg-purple-50 text-purple-600 border-purple-200",
  negotiation: "bg-amber-50 text-amber-700 border-amber-200",
  "closed-won": "bg-green-50 text-green-700 border-green-200",
  "closed-lost": "bg-red-50 text-red-600 border-red-200",
  available: "bg-green-50 text-green-700 border-green-200",
  "under-offer": "bg-amber-50 text-amber-700 border-amber-200",
  sold: "bg-slate-100 text-slate-600 border-slate-300",
  rented: "bg-slate-100 text-slate-600 border-slate-300",
  active: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  closed: "bg-slate-100 text-slate-600 border-slate-300",
};

function Badge({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${className || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {text}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent || "text-heading"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function formatPrice(n: number | null | undefined): string {
  if (!n) return "\u2014";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for existing session on mount — redirect to signin if not authenticated
  useEffect(() => {
    const stored = localStorage.getItem("swayat_dashboard_token");
    if (stored) {
      verifySession(stored);
    } else {
      router.replace("/signin");
    }
  }, [router]);

  async function verifySession(tkn: string) {
    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tkn }),
      });
      const json = await resp.json();
      if (json.valid) {
        setToken(tkn);
        setUser(json.user);
        await fetchDashboard(tkn);
      } else {
        localStorage.removeItem("swayat_dashboard_token");
        router.replace("/signin");
      }
    } catch {
      localStorage.removeItem("swayat_dashboard_token");
      router.replace("/signin");
    } finally {
      setCheckingSession(false);
    }
  }

  async function fetchDashboard(tkn: string) {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const resp = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      const json = await resp.json();
      if (resp.status === 401) {
        handleSignOut();
        return;
      }
      if (json.error) throw new Error(json.error);
      if (!json.found) {
        setError("No data found yet. Start using the AI Agent on WhatsApp to see your activity here.");
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem("swayat_dashboard_token");
    router.replace("/signin");
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "leads", label: "Leads", count: data?.summary.totalLeads },
    { key: "properties", label: "Properties", count: data?.summary.totalProperties },
    { key: "campaigns", label: "Campaigns", count: data?.campaigns.length },
    { key: "transactions", label: "Transactions", count: data?.transactions.length },
  ];

  // Loading session check
  if (checkingSession) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="mt-3 text-sm text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirecting to signin
  if (!token || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="mt-3 text-sm text-muted">Redirecting...</p>
        </div>
      </div>
    );
  }

  // --- Authenticated dashboard ---
  return (
    <div className="mx-auto max-w-7xl px-6">
      {/* Header with user info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-heading">Welcome back, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">
            {user.brokerage && <span>{user.brokerage}</span>}
            {user.license && <span className="ml-2 text-xs text-slate-400">{user.license}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-heading">{user.name}</p>
            <p className="text-xs text-muted">{user.email}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-semibold text-sm">
            {user.name.split(" ").map(n => n[0]).join("")}
          </div>
          <a
            href="/account"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-muted hover:text-heading hover:border-slate-400 transition"
          >
            Account
          </a>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-muted hover:text-heading hover:border-slate-400 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="mt-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="mt-3 text-sm text-muted">Loading your dashboard...</p>
        </div>
      )}

      {data && (
        <>
          {/* Tabs */}
          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted hover:text-heading"
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-1.5 inline-block rounded-full px-2 py-0.5 text-xs ${
                    tab === t.key ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={() => token && fetchDashboard(token)}
              disabled={loading}
              className="ml-auto whitespace-nowrap px-3 py-2 text-sm text-muted hover:text-heading transition disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* Tab content */}
          <div className="mt-6 pb-12">
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "leads" && <LeadsTab leads={data.leads} />}
            {tab === "properties" && <PropertiesTab properties={data.properties} />}
            {tab === "campaigns" && <CampaignsTab campaigns={data.campaigns} />}
            {tab === "transactions" && <TransactionsTab transactions={data.transactions} />}
          </div>
        </>
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: DashboardData }) {
  const s = data.summary;
  return (
    <div className="space-y-8">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Leads" value={s.totalLeads} sub={`${s.hotLeads} hot / ${s.warmLeads} warm / ${s.coldLeads} cold`} />
        <StatCard label="Conversion Rate" value={s.conversionRate} sub={`${s.closedWon} won / ${s.closedLost} lost`} accent="text-green-600" />
        <StatCard label="Properties" value={s.totalProperties} sub={`${s.availableProperties} available / ${s.soldProperties} sold`} />
        <StatCard label="Active Campaigns" value={s.activeCampaigns} />
        <StatCard label="Active Transactions" value={s.activeTransactions} sub={`$${((data.transactions.filter(t => t.status === "pending").reduce((a, t) => a + t.salePrice, 0)) / 1000000).toFixed(1)}M pipeline`} accent="text-blue-600" />
      </div>

      {/* Today's agenda */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's showings */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-heading">Today&apos;s Showings ({data.todaysShowings.length})</h3>
          {data.todaysShowings.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No showings scheduled for today.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.todaysShowings.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-heading">{s.lead}</span>
                    <span className="text-muted"> at {s.property}</span>
                  </div>
                  <span className="font-medium text-primary">{s.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Follow-ups */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-heading">
            Follow-ups
            {data.overdueFollowups.length > 0 && (
              <span className="ml-2 inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                {data.overdueFollowups.length} overdue
              </span>
            )}
          </h3>
          {data.overdueFollowups.length === 0 && data.todaysFollowups.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No follow-ups pending.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.overdueFollowups.map((f, i) => (
                <div key={`o${i}`} className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-red-700">{f.lead}</span>
                    <span className="text-xs text-red-500">Due {f.date}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-red-600">{f.type} &mdash; {f.notes}</p>
                </div>
              ))}
              {data.todaysFollowups.map((f, i) => (
                <div key={`t${i}`} className="rounded-lg bg-surface-light px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-heading">{f.lead}</span>
                    <span className="text-xs text-muted">Today</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{f.type} &mdash; {f.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming deadlines */}
      {data.upcomingDeadlines.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-heading">Upcoming Deadlines</h3>
          <div className="mt-3 space-y-2">
            {data.upcomingDeadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-heading">{d.transaction}</span>
                  <span className="text-muted"> &mdash; {d.deadline}</span>
                </div>
                <span className="font-medium text-amber-600">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent leads */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-heading">Recent Leads</h3>
        {data.recentLeads.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No leads yet. Start capturing leads via WhatsApp!</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted uppercase">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2">Added</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLeads.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-2.5 pr-4 font-medium">{l.name}</td>
                    <td className="py-2.5 pr-4 text-muted">{l.type}</td>
                    <td className="py-2.5 pr-4"><Badge text={l.category} className={CATEGORY_COLORS[l.category]} /></td>
                    <td className="py-2.5 pr-4">{l.score}</td>
                    <td className="py-2.5 pr-4"><Badge text={l.status} className={STATUS_COLORS[l.status]} /></td>
                    <td className="py-2.5 pr-4 text-muted">{l.source || "\u2014"}</td>
                    <td className="py-2.5 text-muted">{l.createdAt || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active Nurture" value={s.activeNurture} sub="leads in drip sequences" />
        <StatCard label="Valuations" value={s.totalValuations} sub="home value estimates" />
        <StatCard label="Referrals" value={s.totalReferrals} sub="from referral program" />
        <StatCard label="Total Showings" value={s.totalShowings} sub={`${s.todaysShowings} today`} />
      </div>
    </div>
  );
}

function LeadsTab({ leads }: { leads: DashboardData["leads"] }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? leads : leads.filter((l) => l.category === filter);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {["all", "hot", "warm", "cold"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? "bg-primary text-white" : "bg-surface-light text-muted hover:text-heading"
            }`}
          >
            {f === "all" ? `All (${leads.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${leads.filter((l) => l.category === f).length})`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-surface-light text-xs text-muted uppercase">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Timeline</th>
              <th className="px-4 py-3">Showings</th>
              <th className="px-4 py-3">Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-muted">No leads found.</td></tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-surface-light transition">
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3 text-muted">{l.phone || "\u2014"}</td>
                  <td className="px-4 py-3 text-muted">{l.type}</td>
                  <td className="px-4 py-3"><Badge text={l.category} className={CATEGORY_COLORS[l.category]} /></td>
                  <td className="px-4 py-3">{l.score}</td>
                  <td className="px-4 py-3"><Badge text={l.status} className={STATUS_COLORS[l.status]} /></td>
                  <td className="px-4 py-3 text-muted">
                    {l.budgetMin || l.budgetMax
                      ? `${formatPrice(l.budgetMin)} \u2013 ${formatPrice(l.budgetMax)}`
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-muted">{l.timeline || "\u2014"}</td>
                  <td className="px-4 py-3 text-center">{l.showingsCount}</td>
                  <td className="px-4 py-3 text-muted">{l.lastContact || "\u2014"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PropertiesTab({ properties }: { properties: DashboardData["properties"] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-surface-light text-xs text-muted uppercase">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Beds</th>
            <th className="px-4 py-3">Sqft</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Showings</th>
          </tr>
        </thead>
        <tbody>
          {properties.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No properties yet.</td></tr>
          ) : (
            properties.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-surface-light transition">
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3 text-muted">{p.type}</td>
                <td className="px-4 py-3 text-muted">{p.location}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(p.price)}</td>
                <td className="px-4 py-3 text-center">{p.bedrooms || "\u2014"}</td>
                <td className="px-4 py-3 text-muted">{p.areaSqft?.toLocaleString() || "\u2014"}</td>
                <td className="px-4 py-3"><Badge text={p.status} className={STATUS_COLORS[p.status]} /></td>
                <td className="px-4 py-3 text-center">{p.showingsCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CampaignsTab({ campaigns }: { campaigns: DashboardData["campaigns"] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-surface-light text-xs text-muted uppercase">
            <th className="px-4 py-3">Campaign</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Channels</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Leads Generated</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No campaigns yet. Ask your AI agent to create one!</td></tr>
          ) : (
            campaigns.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-surface-light transition">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.type}</td>
                <td className="px-4 py-3 text-muted">{(c.channels || []).join(", ")}</td>
                <td className="px-4 py-3"><Badge text={c.status} className={STATUS_COLORS[c.status]} /></td>
                <td className="px-4 py-3 text-center">{c.leadsGenerated}</td>
                <td className="px-4 py-3 text-muted">{c.createdAt || "\u2014"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTab({ transactions }: { transactions: DashboardData["transactions"] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-surface-light text-xs text-muted uppercase">
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Sale Price</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Close Date</th>
            <th className="px-4 py-3">Pending Docs</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No transactions yet.</td></tr>
          ) : (
            transactions.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-surface-light transition">
                <td className="px-4 py-3 font-medium">{t.lead}</td>
                <td className="px-4 py-3 text-muted">{t.property}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(t.salePrice)}</td>
                <td className="px-4 py-3"><Badge text={t.status} className={STATUS_COLORS[t.status]} /></td>
                <td className="px-4 py-3 text-muted">{t.closeDate || "\u2014"}</td>
                <td className="px-4 py-3 text-center">
                  {t.pendingDocs > 0 ? (
                    <span className="text-amber-600 font-medium">{t.pendingDocs}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
