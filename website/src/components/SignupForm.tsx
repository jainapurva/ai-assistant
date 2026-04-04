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
  const [selectedBusinessType, setSelectedBusinessType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email,
          businessType: selectedBusinessType || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section id="waitlist" className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl text-green-600">
            &#10003;
          </div>
          <h2 className="mt-6 text-3xl font-bold text-heading sm:text-4xl">
            You&apos;re on the list!
          </h2>
          <p className="mt-4 text-lg text-body">
            We&apos;ll reach out when it&apos;s your turn. In the meantime, keep
            an eye on your inbox for updates.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          Join the <span className="text-primary">waitlist</span>
        </h2>
        <p className="mt-4 text-center text-body">
          We&apos;re rolling out beta access slowly to ensure every business
          gets a white-glove onboarding experience. Reserve your spot today.
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
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Join the Waitlist"}
          </button>

          <p className="text-center text-xs text-muted">
            We respect your privacy. No spam, ever.
          </p>
        </form>
      </div>
    </section>
  );
}
