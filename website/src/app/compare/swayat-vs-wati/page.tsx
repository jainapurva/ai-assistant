import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";
const competitor = "Wati";
const slug = "swayat-vs-wati";

export const metadata: Metadata = {
  title: "Swayat AI vs Wati: WhatsApp Business Tools Compared (2026)",
  description:
    "Detailed comparison of Swayat AI and Wati for WhatsApp business automation. Compare features, pricing, AI capabilities, and ease of use.",
  keywords: [
    "Swayat vs Wati",
    "Wati alternative",
    "WhatsApp business tools comparison",
    "Wati competitor",
    "WhatsApp chatbot comparison",
  ],
  alternates: {
    canonical: `${siteUrl}/compare/${slug}`,
  },
  openGraph: {
    title: "Swayat AI vs Wati: WhatsApp Business Tools Compared (2026)",
    description:
      "Detailed comparison of Swayat AI and Wati for WhatsApp business automation. Compare features, pricing, AI capabilities, and ease of use.",
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
  { name: "Team inbox", swayat: false, competitor: true },
  { name: "Drag-and-drop flow builder", swayat: false, competitor: true },
  { name: "Dashboard required", swayat: false, competitor: true },
  { name: "Setup time", swayatText: "< 5 minutes", competitorText: "Hours to days" },
  { name: "Free plan", swayat: true, competitor: false },
  { name: "Starting price", swayatText: "Free (paid from &#36;9.99/mo)", competitorText: "&#36;49/month" },
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

export default function SwayatVsWati() {
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
            Looking for a smarter alternative to {competitor}? Here&apos;s how Swayat AI
            and {competitor} compare for WhatsApp business automation.
          </p>
        </section>

        {/* Quick Verdict */}
        <section className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.03] p-8">
          <h2 className="text-xl font-bold text-heading">Quick Verdict</h2>
          <p className="mt-3 text-body leading-relaxed">
            <strong>Swayat AI</strong> is an AI-first WhatsApp assistant that understands
            natural language &mdash; no flow building or template configuration required.{" "}
            <strong>{competitor}</strong> is a rule-based chatbot builder with
            drag-and-drop flows, designed for support teams who need a shared inbox. Choose
            Swayat if you want real AI that works out of the box. Choose {competitor} if
            you need team collaboration features and traditional chatbot flows.
          </p>
        </section>

        {/* Comparison Table */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-heading sm:text-3xl">
            Feature Comparison
          </h2>
          <p className="mt-3 text-body">
            A side-by-side look at what each platform offers.
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
                1. Real AI vs Rule-Based Chatbots
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} uses a drag-and-drop chatbot builder where you manually create
                conversation flows. Every possible customer query needs a pre-built
                path &mdash; if a message doesn&apos;t match a rule, the bot fails.
                Swayat AI uses advanced language models that understand natural
                language. Your customers can ask anything in their own words, and the
                AI responds intelligently without any flow building or template setup.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                2. Built-in Business Tools vs Messaging Only
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                Swayat AI isn&apos;t just a chatbot &mdash; it&apos;s a complete
                business toolkit. Generate invoices, manage appointments, run marketing
                campaigns, and handle customer support &mdash; all through natural
                conversation on WhatsApp. {competitor} focuses primarily on messaging
                automation and team collaboration. For business operations like
                invoicing or appointment booking, you&apos;d need separate tools.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                3. No Dashboard Required
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                {competitor} requires you to use a web dashboard to set up flows,
                manage conversations, and configure your chatbot. Swayat AI works
                entirely from WhatsApp &mdash; the same app your customers and team
                already use. No additional software to learn, no browser tabs to manage.
                Just message your AI assistant like you&apos;d message a colleague.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-heading">
                4. Team Collaboration
              </h3>
              <p className="mt-3 text-body leading-relaxed">
                This is where {competitor} has an edge. Their shared team inbox lets
                multiple agents handle conversations simultaneously, with assignment
                rules and performance tracking. If you run a large customer support
                team that needs to collaborate on conversations, {competitor}&apos;s
                team features are more mature. Swayat AI is designed for small
                businesses and solopreneurs who want AI to handle the work rather than
                managing a team of human agents.
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
                    <strong>Growth:</strong> $49/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Pro:</strong> $99/month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>
                    <strong>Business:</strong> $299/month
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted">
                Additional per-conversation charges may apply.
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
                  <span>Want real AI that understands natural language</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Need business tools (invoicing, booking, CRM) built in</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Are a small business or solopreneur</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Want to start free without a credit card</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Prefer working from WhatsApp (no dashboard)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check />
                  <span>Use Google Workspace for your business</span>
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
                  <span>Have a large support team needing a shared inbox</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Prefer building chatbots with drag-and-drop flows</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need extensive third-party integrations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Want phone number management features</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted font-bold text-lg">&bull;</span>
                  <span>Need agent performance tracking and analytics</span>
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
