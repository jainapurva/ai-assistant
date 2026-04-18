"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  // If already signed in, redirect to dashboard
  useEffect(() => {
    const stored = localStorage.getItem("swayat_dashboard_token");
    if (stored) {
      fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: stored }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.valid) {
            router.replace("/dashboard");
          } else {
            localStorage.removeItem("swayat_dashboard_token");
            setCheckingSession(false);
          }
        })
        .catch(() => {
          localStorage.removeItem("swayat_dashboard_token");
          setCheckingSession(false);
        });
    } else {
      setCheckingSession(false);
    }
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error);

      localStorage.setItem("swayat_dashboard_token", json.token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-heading">Welcome Back</h1>
            <p className="mt-2 text-sm text-muted">Sign in to your Swayat AI dashboard.</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-slate-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoFocus
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-heading">Password</label>
                <a href="/forgot-password" className="text-sm font-medium text-primary transition hover:text-primary-dark">
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-slate-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-xl bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            Don&apos;t have an account?{" "}
            <a href="/#signup" className="font-medium text-primary transition hover:text-primary-dark">
              Sign up for free
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
