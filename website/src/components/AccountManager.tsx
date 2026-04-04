"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const CardForm = dynamic(() => import("./CardForm"), { ssr: false });

interface UserInfo {
  name: string;
  email: string;
  phone: string;
  brokerage?: string;
  license?: string;
}

interface SubscriptionData {
  phone: string;
  signupDate: string;
  trialExpiresAt: string | null;
  subscriptionStatus: string;
  lastPaymentAt: string | null;
  square: {
    status: string;
    startDate: string | null;
    chargedThroughDate: string | null;
    canceledDate: string | null;
  } | null;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  trialing: {
    label: "Free Trial",
    className: "bg-yellow-50 text-yellow-700 border-yellow-300",
  },
  active: {
    label: "Active",
    className: "bg-green-50 text-green-700 border-green-300",
  },
  past_due: {
    label: "Past Due",
    className: "bg-red-50 text-red-700 border-red-300",
  },
  canceled: {
    label: "Canceled",
    className: "bg-slate-100 text-slate-600 border-slate-300",
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function AccountManager() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showCardUpdate, setShowCardUpdate] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [message, setMessage] = useState("");

  // Verify session and auto-fetch subscription data
  useEffect(() => {
    const token = localStorage.getItem("swayat_dashboard_token");
    if (!token) {
      router.replace("/signin");
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.valid) {
          localStorage.removeItem("swayat_dashboard_token");
          router.replace("/signin");
          return;
        }
        setUser(json.user);
        // Auto-fetch subscription using the user's phone
        if (json.user.phone) {
          fetchSubscription(json.user.phone);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        localStorage.removeItem("swayat_dashboard_token");
        router.replace("/signin");
      });
  }, [router]);

  async function fetchSubscription(phone: string) {
    try {
      const res = await fetch("/api/subscription/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await res.json();
      if (res.ok) {
        setData(result);
      } else {
        setError(result.error || "Could not load subscription info");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleCancel = async () => {
    if (!user?.phone) return;
    setCanceling(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user.phone }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Failed to cancel");
        return;
      }

      setMessage(
        `Subscription canceled. You'll have access until ${formatDate(result.chargedThroughDate)}.`
      );
      setShowConfirmCancel(false);
      setData((prev) =>
        prev ? { ...prev, subscriptionStatus: "canceled" } : null
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCanceling(false);
    }
  };

  const handleCardUpdate = async (token: string) => {
    if (!user?.phone) return;
    setUpdatingCard(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/subscription/update-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user.phone, paymentToken: token }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Failed to update card");
        return;
      }

      setMessage("Payment method updated successfully.");
      setShowCardUpdate(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUpdatingCard(false);
    }
  };

  function handleSignOut() {
    localStorage.removeItem("swayat_dashboard_token");
    router.replace("/signin");
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="mt-3 text-sm text-muted">Loading account...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="mt-3 text-sm text-muted">Redirecting...</p>
        </div>
      </div>
    );
  }

  const badge = data
    ? STATUS_BADGES[data.subscriptionStatus] || STATUS_BADGES.active
    : null;

  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-center text-3xl font-bold text-heading">
          Manage Your <span className="text-primary">Account</span>
        </h1>

        {/* User info */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-semibold text-sm">
                {user.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div>
                <p className="font-medium text-heading">{user.name}</p>
                <p className="text-sm text-muted">{user.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href="/dashboard"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-muted hover:text-heading hover:border-slate-400 transition"
              >
                Dashboard
              </a>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-muted hover:text-heading hover:border-slate-400 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
          {user.brokerage && (
            <p className="mt-3 text-sm text-muted">{user.brokerage}</p>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {message && (
          <p className="mt-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">
            {message}
          </p>
        )}

        {/* Subscription dashboard */}
        {data && (
          <div className="mt-6 space-y-6">
            {/* Status card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-heading">Subscription</h2>
                {badge && (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-body">Signed up</dt>
                  <dd className="text-heading">{formatDate(data.signupDate)}</dd>
                </div>

                {data.subscriptionStatus === "trialing" &&
                  data.trialExpiresAt && (
                    <div className="flex justify-between">
                      <dt className="text-body">Trial ends</dt>
                      <dd className="text-heading">{formatDate(data.trialExpiresAt)}</dd>
                    </div>
                  )}

                {data.square?.chargedThroughDate && (
                  <div className="flex justify-between">
                    <dt className="text-body">
                      {data.subscriptionStatus === "canceled"
                        ? "Access until"
                        : "Next billing date"}
                    </dt>
                    <dd className="text-heading">{formatDate(data.square.chargedThroughDate)}</dd>
                  </div>
                )}

                {data.lastPaymentAt && (
                  <div className="flex justify-between">
                    <dt className="text-body">Last payment</dt>
                    <dd className="text-heading">{formatDate(data.lastPaymentAt)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Actions */}
            {data.subscriptionStatus !== "canceled" && (
              <div className="space-y-3">
                {/* Update card */}
                {!showCardUpdate ? (
                  <button
                    onClick={() => setShowCardUpdate(true)}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 font-medium text-heading transition hover:border-primary hover:bg-primary/5"
                  >
                    Update Payment Method
                  </button>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 font-semibold text-heading">
                      Update Payment Method
                    </h3>
                    <CardForm
                      onTokenized={handleCardUpdate}
                      submitting={updatingCard}
                    />
                    <button
                      onClick={() => setShowCardUpdate(false)}
                      className="mt-3 w-full text-sm text-muted hover:text-heading"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Cancel subscription */}
                {!showConfirmCancel ? (
                  <button
                    onClick={() => setShowConfirmCancel(true)}
                    className="w-full rounded-xl py-3 text-sm text-muted transition hover:text-red-600"
                  >
                    Cancel Subscription
                  </button>
                ) : (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
                    <p className="text-sm text-body">
                      Are you sure? You&apos;ll keep access until the end of
                      your current billing period.
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={handleCancel}
                        disabled={canceling}
                        className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {canceling ? "Canceling..." : "Yes, Cancel"}
                      </button>
                      <button
                        onClick={() => setShowConfirmCancel(false)}
                        className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm text-heading transition hover:border-primary"
                      >
                        Keep Subscription
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!data && !error && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <p className="text-sm text-muted">No subscription found for this account.</p>
          </div>
        )}
      </div>
    </section>
  );
}
