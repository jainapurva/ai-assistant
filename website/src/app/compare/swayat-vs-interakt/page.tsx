import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";
const competitor = "Interakt";
const slug = "swayat-vs-interakt";

export const metadata: Metadata = {
  title:
    "Swayat AI vs Interakt: Which WhatsApp Tool is Right for You? (2026)",
  description:
    "Swayat AI vs Interakt comparison for WhatsApp marketing and business automation. See features, pricing, and which is better for your business.",
  keywords: [
    "Swayat vs Interakt",
    "Interakt alternative",
    "WhatsApp marketing tool",
    "Interakt competitor",
    "WhatsApp business automation",
  ],
  alternates: {
    canonical: `${siteUrl}/compare/${slug}`,
  },
  openGraph: {
    title:
      "Swayat AI vs Interakt: Which WhatsApp Tool is Right for You? (2026)",
    description:
      "Swayat AI vs Interakt comparison for WhatsApp marketing and business automation. See features, pricing, and which is better for your business.",
    url: `${siteUrl}/compare/${slug}`,
    siteName: "Swayat AI",
    type: "article",
  },
};

const features = [
  { name: "AI-powered conversations", swayat: true, competitor: false },
  { name: "Natural language understanding", swayat: true, competitor: false },
  { name: "Invoicing & payments", swayat: true, competitor: false },
  { name: "Appointment booking", swayat: true, competitor: false },
  { name: "Real estate CRM", swayat: true, competitor: false },
  { name: "Marketing automation", swayat: true, competitor: true },
  { name: "Customer support", swayat: true, competitor: true },
  { name: "Google Workspace integration", swayat: true, competitor: false },
  { name: "E-commerce integrations", swayat: false, competitor: true },
  { name: "Catalog management", swayat: false, competitor: true },
  { name: "Order notifications", swayat: false, competitor: true },
  { name: "Green tick verification support", swayat: false, competitor: true },
  { name: "Dashboard required", swayat: false, competitor: true },
  { name: "Setup time", swayatText: "< 5 minutes", competitorText: "Hours to days" },
  { name: "Free plan", swayat: true, competitor: false },
  {
    name: "Starting price",
    swayatText: "Free (paid from &#36;9.99/mo)",
    competitorText: "&#36;49/month+",
  },
];

function Check() {
  return (
    <span className="inline-flex items-center justify-center text-green-600 font-bold text-lg">
      &#10003;
    </span>
  );
}

function Cross() {
  return (
    <span className="inline-flex items-center justify-center text-red-500 font-bold text-lg">
      &#10007;
    </span>
  );
}

export default function SwayatVsInterakt() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
        {/* Hero */}
        <section className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Comparison
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">
            Swayat AI vs {competitor}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body">
            Comparing two WhatsApp business platforms for small businesses.
            See which one fits your needs &mdash; AI-powered tools or
            e-commerce-focused marketing.
          </p>
        </section>

        {/* Quick Verdict */}
        <section className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.03] p-8">
          <h2 className="text-xl font-bold text-heading">Quick Verdict</h2>
          <p className="mt-3 text-body leading-relaxed">
            <strong>Swayat AI</strong> is an AI-powered business assistant that
            handles invoicing, booking, marketing, and support through natural
            conversation on WhatsApp.{" "}
            <strong>{competitor}</strong> (by Jio/Haptik) is a WhatsApp marketing
            platform built for e-commerce &mdash; great for Shopify stores and catalog
            management, but relies on templates and rule-based automation. Choose
            Swayat for AI-powered business tools; choose {competitor} for
            e-commerce-focused WhatsApp marketing.
          </p>
        </section>

        {/* Comparison Table */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Feature Comparison
          </h2>
          <p className="mt-3 text-body">
            How Swayat AI and {competitor} stack up feature by feature.
          </p>

          <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-surface-light">
                  <th className="px-6 py-4 text-left font-semibold text-heading">
                    Feature
                  </th>
                  <th className="px-6 py-4 text-center font-semibold text-primary bg-primary/[0.06]">
                    Swayat AI
                  </th>
                  <th className="px-6 py-4 text-center font-semibold text-heading">
                    {competitor}
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f, i) => (
                  <tr
                    key={f.name}
                    className={
                      i % 2 === 0
                        ? "bg-surface"
                        : "bg-surface-light/50"
                    }
                  >
                    <td className="px-6 py-3.5 text-body font-medium">
                      {f.name}
                    </td>
                    <td className="px-6 py-3.5 text-center bg-primary/[0.03]">
                      {f.swayatText ? (
                        <span
                          className="text-body"
                          dangerouslySetInnerHTML={{ __html: f.swayatText }}
                        />
                      ) : f.swayat ? (
                        <Check />
                      ) : (
                        <Cross />
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {f.competitorText ? (
                        <span
                          className="text-body"
                          dangerouslySetInnerHTML={{ __html: f.competitorText }}
                        />
                      ) : f.competitor ? (
                        <Check />
                      ) : (
                        <Cross />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Breakdown */}
        <section className="mt-16 space-y-12">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Key Differences Explained
          </h2>

          <div className="space-y-10">
            <div>
              <h3 className="text-xl font-semibold text-heading">
                1. AI Intelligence vs Template-Based Automation
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} relies on pre-built message templates and rule-based
                automation. You configure campaigns and set up keyword triggers, but
                the system can&apos;t handle unexpected queries or complex requests.
                Swayat AI uses advanced language models that understand what your
                customers mean, not just what keywords they type. Ask it to
                &quot;send an invoice to Sarah for last Tuesday&apos;s consultation&quot;
                and it just works &mdash; no template needed.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                2. Business Tools vs E-commerce Focus
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} is built for e-commerce businesses &mdash; it integrates
                with Shopify and WooCommerce, manages product catalogs, and sends
                order notifications. If you run an online store, these features are
                valuable. Swayat AI takes a different approach: it provides 7
                specialized business tools (invoicing, booking, marketing, support,
                real estate CRM, and more) that work for any small business, not just
                e-commerce. It&apos;s a complete business operating system on WhatsApp.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                3. Pricing and Value
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} starts at $49/month with no free tier. For a small
                business just getting started, that&apos;s a significant monthly cost
                before you&apos;ve even proven the ROI. Swayat AI offers a genuinely
                free Starter plan (100 messages/month) and its paid plans start at just
                $9.99/month &mdash; a fraction of {competitor}&apos;s starting price,
                with AI-powered tools included rather than basic template messaging.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                4. E-commerce Integrations
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                This is {competitor}&apos;s strongest area. Native Shopify and
                WooCommerce integrations mean you can automate abandoned cart recovery,
                order confirmations, and shipping updates directly through WhatsApp.
                {competitor} also supports catalog management and product browsing
                within WhatsApp conversations. If your primary need is e-commerce
                automation, {competitor} has deeper integrations in this space.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Comparison */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Pricing Comparison
          </h2>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {/* Swayat pricing */}
            <div className="rounded-2xl border-2 border-primary bg-primary/[0.02] p-8">
              <h3 className="text-lg font-bold text-primary">Swayat AI</h3>
              <ul className="mt-4 space-y-3 text-sm text-body">
                <li className="flex items-start gap-2">
                  <Check />
                  <span>
                    <strong>Starter:</strong> Free &mdash; 100 messages/month, 1 business tool
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>
                    <strong>Business:</strong> $9.99/mo &mdash; 2,000 messages, all tools
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>
                    <strong>Pro:</strong> $29.99/mo &mdash; 10,000 messages, advanced features
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted">
                No credit card required for free plan.
              </p>
            </div>

            {/* Competitor pricing */}
            <div className="rounded-2xl border border-slate-200 p-8">
              <h3 className="text-lg font-bold text-heading">{competitor}</h3>
              <ul className="mt-4 space-y-3 text-sm text-body">
                <li className="flex items-start gap-2">
                  <Cross />
                  <span>No free plan available</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Starter:</strong> $49/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Growth:</strong> $79/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Advanced:</strong> $129/month
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted">
                Per-conversation charges apply on all plans.
              </p>
            </div>
          </div>
        </section>

        {/* Who Should Choose Which */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Who Should Choose Which?
          </h2>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-surface-light/50 p-8">
              <h3 className="text-lg font-bold text-primary">
                Choose Swayat AI if you&hellip;
              </h3>
              <ul className="mt-4 space-y-2 text-sm text-body">
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Run a service-based business (consulting, freelancing, agencies)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Need invoicing, booking, or CRM features built in</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Want AI that understands natural language (no templates)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Are a small business on a budget (free plan available)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Work in real estate and need lead management</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Use Google Workspace (Gmail, Calendar, Drive)</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-surface-light/50 p-8">
              <h3 className="text-lg font-bold text-heading">
                Choose {competitor} if you&hellip;
              </h3>
              <ul className="mt-4 space-y-2 text-sm text-body">
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Run a Shopify or WooCommerce store</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need product catalog management on WhatsApp</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Want automated order notifications and updates</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need Green tick verification support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Prefer a platform backed by Jio/Haptik ecosystem</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-20 rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-10 text-center text-white sm:p-14">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to try the smarter alternative?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            Start using Swayat AI for free &mdash; no credit card, no dashboard, no
            complicated setup. Just message your AI assistant on WhatsApp and get
            to work.
          </p>
          <a
            href="/#waitlist"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3.5 text-lg font-semibold text-primary transition hover:bg-white/90"
          >
            Join Waitlist Today
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
