"use client";

import { useState } from "react";

const businessTypes = [
  "Freelancer / Consultant",
  "Salon / Spa / Beauty",
  "Restaurant / Cafe",
  "Retail / Local Shop",
  "Online Store / E-commerce",
  "Healthcare / Clinic",
  "Real Estate",
  "Education / Tutoring",
  "Professional Services",
  "Other",
];

export default function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [selectedBusinessType, setSelectedBusinessType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [waLink, setWaLink] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email,
          phone,
          password,
          businessType: selectedBusinessType || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setWaLink(data.waLink || "");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (waLink) {
    return (
      <section id="signup" className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl text-green-600">
            &#10003;
          </div>
          <h2 className="mt-6 text-3xl font-bold text-heading sm:text-4xl">
            You&apos;re all set!
          </h2>
          <p className="mt-4 text-lg text-body">
            Your account has been created. Start chatting with your AI assistant on WhatsApp or sign in to your dashboard.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#25D366] px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-[#1da851]"
            >
              Open WhatsApp
            </a>
            <a
              href="/signin"
              className="rounded-full border border-slate-300 px-8 py-3.5 text-lg font-semibold text-heading transition hover:border-primary hover:bg-primary/5"
            >
              Sign In to Dashboard
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="signup" className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          Get started with <span className="text-primary">Swayat AI</span>
        </h2>
        <p className="mt-4 text-center text-body">
          Create your account in seconds. No credit card required &mdash; start
          with a free plan and upgrade when you&apos;re ready.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          {/* Full name */}
          <div>
            <label
              htmlFor="fullName"
              className="mb-1.5 block text-sm font-medium text-heading"
            >
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-heading"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Phone */}
          <div>
            <label
              htmlFor="phone"
              className="mb-1.5 block text-sm font-medium text-heading"
            >
              WhatsApp phone number
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted">
              Include your country code (e.g. +1 for US)
            </p>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-heading"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Business type (optional) */}
          <div>
            <label
              htmlFor="businessType"
              className="mb-1.5 block text-sm font-medium text-heading"
            >
              What type of business do you run?{" "}
              <span className="text-muted">(optional)</span>
            </label>
            <select
              id="businessType"
              value={selectedBusinessType}
              onChange={(e) => setSelectedBusinessType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">Select your business type</option>
              {businessTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
              <p>{error}</p>
              {error.includes("already registered") && (
                <p className="mt-1.5">
                  <a href="/signin" className="font-medium underline hover:text-red-800">Sign in</a>
                  {" or "}
                  <a href="/forgot-password" className="font-medium underline hover:text-red-800">reset your password</a>
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Create Free Account"}
          </button>

          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <a
              href="/signin"
              className="font-medium text-primary transition hover:text-primary-dark"
            >
              Sign in
            </a>
          </p>

          <p className="text-center text-xs text-muted">
            By signing up, you agree to our{" "}
            <a href="/terms" className="underline hover:text-heading">Terms of Service</a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-heading">Privacy Policy</a>.
          </p>
        </form>
      </div>
    </section>
  );
}
