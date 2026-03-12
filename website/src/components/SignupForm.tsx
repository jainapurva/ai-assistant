"use client";

import { useState } from "react";
import SuccessModal from "./SuccessModal";
import { countryCodes } from "@/lib/country-codes";
import { AGENTS } from "@/lib/agents";

export default function SignupForm() {
  const [selectedAgent, setSelectedAgent] = useState("general");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryDial, setCountryDial] = useState("+1");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [waLink, setWaLink] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const fullPhone = countryDial + phone.replace(/[\s\-().]/g, "");

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, agent: selectedAgent, name: fullName, email }),
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
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          Ready to <span className="text-primary">get started</span>?
        </h2>
        <p className="mt-4 text-center text-body">
          Pick an agent, enter your WhatsApp number, and you&apos;ll be chatting in seconds.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          {/* Agent selection */}
          <div>
            <label className="mb-3 block text-sm font-medium text-heading">
              Choose your agent
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AGENTS.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedAgent === agent.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-slate-200 bg-white hover:border-primary/40"
                  }`}
                >
                  <span className="text-2xl">{agent.icon}</span>
                  <h3 className="mt-2 text-sm font-semibold text-heading">{agent.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-body">
                    {agent.description}
                  </p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              You can switch agents anytime in WhatsApp with /agents
            </p>
          </div>

          {/* Name input */}
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-heading">
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

          {/* Email input */}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-heading">
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

          {/* Phone input */}
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-heading">
              WhatsApp phone number
            </label>
            <div className="flex gap-2">
              <select
                value={countryDial}
                onChange={(e) => setCountryDial(e.target.value)}
                className="w-[120px] shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-heading outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {countryCodes.map((c) => (
                  <option key={`${c.code}-${c.dial}`} value={c.dial}>
                    {c.flag} {c.dial}
                  </option>
                ))}
              </select>
              <input
                id="phone"
                type="tel"
                placeholder="555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-heading placeholder-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
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
            {submitting ? "Signing up..." : "Get Started"}
          </button>
        </form>
      </div>

      <SuccessModal
        open={showSuccess}
        waLink={waLink}
        isPaid={false}
        onClose={() => setShowSuccess(false)}
      />
    </section>
  );
}
