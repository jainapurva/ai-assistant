"use client";

import { useEffect, useState } from "react";

type AuthState = "loading" | "signed-in" | "signed-out";

export default function Header() {
  const [auth, setAuth] = useState<AuthState>("loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("swayat_dashboard_token") : null;
    if (!token) {
      setAuth("signed-out");
      return;
    }
    let cancelled = false;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.valid) {
          setAuth("signed-in");
        } else {
          localStorage.removeItem("swayat_dashboard_token");
          setAuth("signed-out");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAuth("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    setFeaturesOpen(false);
  };

  return (
    <header className="fixed top-4 left-1/2 z-50 w-full max-w-[1200px] -translate-x-1/2 px-4 sm:top-6">
      <div
        className="flex items-center justify-between rounded-full border border-slate-900/[0.06] py-2 pr-2 pl-5 backdrop-blur-xl backdrop-saturate-150 sm:pl-6"
        style={{
          background: "rgba(255,255,255,0.72)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 20px 40px -20px rgba(15,23,42,0.20)",
        }}
      >
        {/* Left: wordmark + primary nav */}
        <div className="flex items-center gap-4 sm:gap-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-base font-medium tracking-[-0.02em] text-ink transition hover:opacity-90"
            aria-label="Swayat home"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-ink text-white">
              <svg width="14" height="14" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <path
                  d="M72 30 C72 18, 50 18, 40 28 C30 38, 42 44, 58 50 C74 56, 80 66, 70 76 C60 86, 40 86, 28 76"
                  stroke="white"
                  strokeWidth="11"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
            <span>
              swayat<span className="text-slate-300">.</span>
            </span>
          </a>
          <nav className="hidden items-center gap-5 text-[13.5px] text-ink-2 sm:flex">
            <div className="group relative inline-block">
              <a
                href="/#features"
                className="inline-flex items-center gap-1.5 transition hover:text-ink"
              >
                Features
                <span
                  className="inline-block h-[5px] w-[5px] -translate-y-px rotate-45 border-r-[1.5px] border-b-[1.5px] border-current"
                  aria-hidden="true"
                />
              </a>
              <div className="pointer-events-none absolute left-0 top-full z-50 w-56 pt-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                <div className="rounded-2xl border border-slate-900/[0.06] bg-white/95 p-2 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.20)] backdrop-blur">
                  <a href="/features/invoicing" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">Invoicing</a>
                  <a href="/features/booking" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">Booking</a>
                  <a href="/features/marketing" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">Marketing</a>
                  <a href="/features/real-estate" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">Real Estate CRM</a>
                  <a href="/features/customer-support" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">Customer Support</a>
                  <a href="/features/whatsapp-crm" className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-cream hover:text-ink">WhatsApp CRM</a>
                </div>
              </div>
            </div>
            <a href="/#pricing" className="transition hover:text-ink">Pricing</a>
            <a href="/blog" className="transition hover:text-ink">Blog</a>
          </nav>
        </div>

        {/* Right: ghost links + ink CTA */}
        <div className="hidden items-center gap-1 sm:flex">
          <a
            href="/book-demo"
            className="rounded-full px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:bg-slate-900/5 hover:text-ink"
          >
            Book a demo
          </a>
          {auth === "signed-in" ? (
            <a
              href="/dashboard"
              className="ml-1 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              Dashboard <span aria-hidden="true">→</span>
            </a>
          ) : (
            <>
              <a
                href="/signin"
                className={`rounded-full px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:bg-slate-900/5 hover:text-ink ${auth === "loading" ? "invisible" : ""}`}
              >
                Sign in
              </a>
              <a
                href="/#signup"
                className={`ml-1 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 ${auth === "loading" ? "invisible" : ""}`}
              >
                Get started <span aria-hidden="true">→</span>
              </a>
            </>
          )}
        </div>

        {/* Mobile compact CTA + menu toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          {auth === "signed-in" ? (
            <a
              href="/dashboard"
              className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/#signup"
              className={`rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white ${auth === "loading" ? "invisible" : ""}`}
            >
              Get started
            </a>
          )}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-slate-900/5"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="mt-2 rounded-3xl border border-slate-900/[0.06] bg-white/95 p-2 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.20)] backdrop-blur sm:hidden"
        >
          <nav className="flex flex-col p-2">
            <button
              type="button"
              onClick={() => setFeaturesOpen((v) => !v)}
              aria-expanded={featuresOpen}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-base text-ink transition hover:bg-cream"
            >
              <span>Features</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${featuresOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {featuresOpen && (
              <div className="flex flex-col pl-3 pb-2">
                <a href="/features/invoicing" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">Invoicing</a>
                <a href="/features/booking" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">Booking</a>
                <a href="/features/marketing" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">Marketing</a>
                <a href="/features/real-estate" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">Real Estate CRM</a>
                <a href="/features/customer-support" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">Customer Support</a>
                <a href="/features/whatsapp-crm" onClick={closeMenu} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-cream">WhatsApp CRM</a>
              </div>
            )}
            <a href="/#pricing" onClick={closeMenu} className="rounded-xl px-3 py-3 text-base text-ink hover:bg-cream">Pricing</a>
            <a href="/blog" onClick={closeMenu} className="rounded-xl px-3 py-3 text-base text-ink hover:bg-cream">Blog</a>
            <a href="/book-demo" onClick={closeMenu} className="rounded-xl px-3 py-3 text-base text-ink hover:bg-cream">Book a demo</a>
            {auth !== "signed-in" && (
              <a
                href="/signin"
                onClick={closeMenu}
                className={`rounded-xl px-3 py-3 text-base text-ink hover:bg-cream ${auth === "loading" ? "invisible" : ""}`}
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
