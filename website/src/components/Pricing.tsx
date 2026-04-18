"use client";

import { CheckIcon } from "./Icons";

const tiers = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    badge: null,
    features: [
      "100 messages/month",
      "1 business tool (choose any)",
      "Google account connection",
      "WhatsApp support",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Business",
    price: "$9.99",
    period: "/mo",
    badge: "Popular",
    features: [
      "2,000 messages/month",
      "All 7 business tools",
      "Google Workspace integration",
      "Social media publishing",
      "Email campaigns",
      "Priority support",
    ],
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$29.99",
    period: "/mo",
    badge: null,
    features: [
      "10,000 messages/month",
      "Everything in Business",
      "Website management tools",
      "Advanced analytics",
      "Custom workflows",
      "Dedicated support",
    ],
    cta: "Get Started",
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-heading sm:text-4xl">
          Simple, transparent{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            pricing
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-body">
          Start free. Upgrade when you&apos;re ready.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-8 transition ${
                tier.highlight
                  ? "border-primary bg-primary/[0.02] shadow-lg shadow-primary/10"
                  : "border-slate-200 bg-surface"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-white">
                  {tier.badge}
                </span>
              )}

              <h3 className="text-lg font-semibold text-heading">
                {tier.name}
              </h3>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-heading">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-base text-muted">{tier.period}</span>
                )}
              </div>

              <ul className="mt-8 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-body"
                  >
                    <CheckIcon size={16} className="mt-0.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="#signup"
                className={`mt-8 block rounded-full py-3 text-center text-sm font-semibold transition ${
                  tier.highlight
                    ? "bg-primary text-white hover:bg-primary-dark"
                    : "border border-slate-300 text-heading hover:border-primary hover:bg-primary/5"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted">
          All plans include WhatsApp end-to-end encryption. No credit card
          required to get started.
        </p>
        <p className="mt-3 text-center text-sm text-body">
          Need more?{" "}
          <a
            href="mailto:support@swayat.com"
            className="font-medium text-primary transition hover:text-primary-dark"
          >
            Contact us at support@swayat.com
          </a>{" "}
          for custom enterprise plans.
        </p>
      </div>
    </section>
  );
}
