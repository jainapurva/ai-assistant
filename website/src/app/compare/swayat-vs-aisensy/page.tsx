import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";
const competitor = "AiSensy";
const slug = "swayat-vs-aisensy";

export const metadata: Metadata = {
  title:
    "Swayat AI vs AiSensy: WhatsApp Business Platform Comparison (2026)",
  description:
    "Compare Swayat AI and AiSensy for WhatsApp business automation. Features, pricing, AI capabilities, and which is better for small businesses.",
  keywords: [
    "Swayat vs AiSensy",
    "AiSensy alternative",
    "WhatsApp chatbot platform",
    "AiSensy competitor",
    "WhatsApp business API",
  ],
  alternates: {
    canonical: `${siteUrl}/compare/${slug}`,
  },
  openGraph: {
    title:
      "Swayat AI vs AiSensy: WhatsApp Business Platform Comparison (2026)",
    description:
      "Compare Swayat AI and AiSensy for WhatsApp business automation. Features, pricing, AI capabilities, and which is better for small businesses.",
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
  { name: "Broadcast messaging", swayat: false, competitor: true },
  { name: "Click-to-WhatsApp ad integration", swayat: false, competitor: true },
  { name: "Chatbot builder with analytics", swayat: false, competitor: true },
  { name: "WhatsApp API provider", swayat: false, competitor: true },
  { name: "Dashboard required", swayat: false, competitor: true },
  { name: "Setup time", swayatText: "< 5 minutes", competitorText: "Hours to days" },
  { name: "Free plan", swayat: true, competitor: false },
  {
    name: "Starting price",
    swayatText: "Free (paid from &#36;9.99/mo)",
    competitorText: "&#36;15/month+",
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

export default function SwayatVsAiSensy() {
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
            Two WhatsApp business platforms, two very different approaches.
            See how Swayat AI&apos;s real AI compares to {competitor}&apos;s
            rule-based chatbot builder.
          </p>
        </section>

        {/* Quick Verdict */}
        <section className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.03] p-8">
          <h2 className="text-xl font-bold text-heading">Quick Verdict</h2>
          <p className="mt-3 text-body leading-relaxed">
            <strong>Swayat AI</strong> is an AI-powered business assistant with 7
            specialized tools that understand natural language &mdash; just tell it
            what you need.{" "}
            <strong>{competitor}</strong> is a WhatsApp Business API provider with a
            chatbot builder, broadcast messaging, and click-to-WhatsApp ad integration.
            Choose Swayat for intelligent automation that works without configuration.
            Choose {competitor} for traditional chatbot flows and WhatsApp API
            access with ad integration.
          </p>
        </section>

        {/* Comparison Table */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Feature Comparison
          </h2>
          <p className="mt-3 text-body">
            A detailed look at Swayat AI vs {competitor} across key features.
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
                1. Real AI vs Rule-Based Chatbot Builder
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} offers a chatbot builder where you define conversation
                flows, set keyword triggers, and create template responses. Every path
                must be manually configured. If a customer&apos;s message doesn&apos;t
                match a keyword, the chatbot doesn&apos;t know what to do. Swayat AI
                uses advanced language models that understand intent and context. Your
                customers can message naturally &mdash; &quot;reschedule my appointment
                to next Thursday&quot; or &quot;send Mike a reminder about his
                payment&quot; &mdash; and the AI handles it intelligently without
                any pre-configured flows.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                2. Business Operations vs Messaging Platform
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} is fundamentally a messaging platform &mdash; it helps you
                send broadcasts, manage chatbot conversations, and integrate with
                WhatsApp ads. Swayat AI goes further by providing actual business
                operations: generate and send invoices, manage appointment calendars,
                track real estate leads with a built-in CRM, and run marketing
                campaigns. It&apos;s not just a chatbot &mdash; it&apos;s a business
                operating system that works through WhatsApp.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                3. Click-to-WhatsApp Ads
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} has a strong integration with Meta&apos;s click-to-WhatsApp
                ad platform, making it easy to run Facebook and Instagram ads that drive
                users directly into WhatsApp conversations. If paid ad campaigns are a
                core part of your marketing strategy, {competitor}&apos;s ad integration
                and campaign analytics give it an advantage in this specific area.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                4. Setup and Ease of Use
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                Getting started with {competitor} requires signing up for WhatsApp
                Business API access, configuring your chatbot flows in their dashboard,
                and setting up templates for approval. This process can take hours to
                days. Swayat AI requires no dashboard, no flow building, and no API
                setup. Sign up, connect your WhatsApp, and start messaging your AI
                assistant immediately. It&apos;s designed for business owners, not
                developers.
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
                    <strong>Basic:</strong> $15/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Pro:</strong> $35/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Enterprise:</strong> $75/month
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted">
                Per-conversation charges apply. WhatsApp API charges extra.
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
                  <span>Want AI that understands natural language (not keyword matching)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Need business tools built in (invoicing, booking, CRM)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Are a small business owner or solopreneur</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Want to start free and upgrade as you grow</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Don&apos;t want to learn a dashboard or build chatbot flows</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Work in real estate, consulting, or service businesses</span>
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
                  <span>Run click-to-WhatsApp ad campaigns on Facebook/Instagram</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need a WhatsApp Business API provider</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Want detailed chatbot analytics and reporting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Prefer building custom chatbot flows with a visual builder</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need bulk broadcast messaging at scale</span>
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
