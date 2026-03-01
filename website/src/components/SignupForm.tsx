"use client";

import { useState, useCallback } from "react";
import SuccessModal from "./SuccessModal";

export default function SignupForm() {
  const [phone, setPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<{
    checking: boolean;
    valid?: boolean;
    message?: string;
  }>({ checking: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [waLink, setWaLink] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const validatePromo = useCallback(async (code: string) => {
    if (!code.trim()) {
      setPromoStatus({ checking: false });
      return;
    }
    setPromoStatus({ checking: true });
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      setPromoStatus({
        checking: false,
        valid: data.valid,
        message: data.valid
          ? `${data.trialDays}-day free trial`
          : data.error,
      });
    } catch {
      setPromoStatus({ checking: false, valid: false, message: "Could not validate code" });
    }
  }, []);

  // Debounced promo validation
  const handlePromoChange = (value: string) => {
    setPromoCode(value);
    setPromoStatus({ checking: false });

    if (value.trim().length >= 3) {
      // Simple debounce with timeout
      const timeout = setTimeout(() => validatePromo(value), 500);
      return () => clearTimeout(timeout);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setWaLink(data.waLink);
      setShowSuccess(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="signup" className="px-6 py-24">
      <div className="mx-auto max-w-md">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          Ready to <span className="text-primary-light">get started</span>?
        </h2>
        <p className="mt-4 text-center text-gray-400">
          Enter your WhatsApp number and you&apos;ll be chatting in seconds.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          {/* Phone number */}
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-300">
              WhatsApp phone number
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-surface-lighter px-4 py-3 text-white placeholder-gray-500 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Promo code */}
          <div>
            <label htmlFor="promo" className="mb-1.5 block text-sm font-medium text-gray-300">
              Promo code{" "}
              <span className="text-gray-500">(optional)</span>
            </label>
            <input
              id="promo"
              type="text"
              placeholder="e.g. EARLYBIRD"
              value={promoCode}
              onChange={(e) => handlePromoChange(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-white/10 bg-surface-lighter px-4 py-3 text-white uppercase placeholder-gray-500 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {promoStatus.checking && (
              <p className="mt-1.5 text-sm text-gray-400">Checking...</p>
            )}
            {!promoStatus.checking && promoStatus.valid === true && (
              <p className="mt-1.5 text-sm text-green-400">
                ✓ {promoStatus.message}
              </p>
            )}
            {!promoStatus.checking && promoStatus.valid === false && (
              <p className="mt-1.5 text-sm text-red-400">
                {promoStatus.message}
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3.5 text-lg font-semibold transition hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? "Signing up..." : "Sign Up"}
          </button>
        </form>
      </div>

      <SuccessModal
        open={showSuccess}
        waLink={waLink}
        onClose={() => setShowSuccess(false)}
      />
    </section>
  );
}
