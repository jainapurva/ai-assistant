import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp Customer Support Bot \u2014 AI-Powered Support | Swayat AI",
  description:
    "Draft responses to customer queries, track support tickets, and resolve complaints faster \u2014 all from WhatsApp. AI customer support for small businesses.",
  keywords: [
    "WhatsApp customer support bot",
    "WhatsApp support automation",
    "customer service bot WhatsApp",
    "AI customer support",
    "WhatsApp helpdesk",
    "customer complaint management WhatsApp",
    "support ticket WhatsApp",
    "AI support assistant",
  ],
  alternates: {
    canonical: `${siteUrl}/features/customer-support`,
  },
  openGraph: {
    title:
      "WhatsApp Customer Support Bot \u2014 AI-Powered Support",
    description:
      "Draft responses, track tickets, resolve complaints faster \u2014 all from WhatsApp. AI customer support for small businesses.",
    url: `${siteUrl}/features/customer-support`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Customer Support on WhatsApp | Swayat AI",
    description:
      "Draft responses, track tickets, and resolve complaints faster \u2014 all from WhatsApp.",
  },
};

const features = [
  {
    icon: "\uD83E\uDD16",
    title: "AI Response Drafting",
    description:
      "Describe the customer\u2019s issue and Swayat drafts a professional, empathetic response. Edit if needed, or send as-is.",
  },
  {
    icon: "\uD83C\uDFAB",
    title: "Ticket Tracking",
    description:
      "Every customer issue gets a ticket number. Track open, in-progress, and resolved tickets without a helpdesk tool.",
  },
  {
    icon: "\uD83D\uDCCB",
    title: "FAQ Generation",
    description:
      "Swayat analyzes your most common queries and generates an FAQ document you can share with your team or customers.",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "Complaint Analysis",
    description:
      "Get weekly summaries of complaint trends \u2014 what customers complain about most, resolution times, and repeat issues.",
  },
  {
    icon: "\uD83D\uDCDD",
    title: "Professional Templates",
    description:
      "Pre-built response templates for common scenarios: refunds, delays, product issues, and follow-ups. Customize to match your tone.",
  },
  {
    icon: "\u2705",
    title: "Resolution Tracking",
    description:
      "Mark issues as resolved, track average resolution time, and identify bottlenecks in your support process.",
  },
];

const steps = [
  {
    step: "1",
    title: "Share the customer issue",
    description:
      "Forward the customer\u2019s message or describe the problem. Swayat understands the context instantly.",
  },
  {
    step: "2",
    title: "Get a draft response",
    description:
      "Swayat drafts a professional reply with the right tone \u2014 apology, solution, and next steps included.",
  },
  {
    step: "3",
    title: "Send and track",
    description:
      "Send the response and Swayat tracks the ticket. Get notified if the issue isn\u2019t resolved within your SLA.",
  },
];

export default function CustomerSupportPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-32 pb-20">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-accent/10 blur-[100px]" />
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Customer Support
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              AI Customer Support{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                on WhatsApp
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              Stop drowning in customer messages. Draft professional responses,
              track support tickets, and resolve complaints faster \u2014 all
              from your WhatsApp.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="/#waitlist"
                className="rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
              >
                Join Waitlist
              </a>
              <a
                href="#how-it-works"
                className="rounded-full border border-slate-300 px-8 py-3.5 text-lg font-semibold text-heading transition hover:border-primary hover:bg-primary/5"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* Pain Point */}
        <section className="bg-surface-light px-6 py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold text-heading sm:text-4xl">
              Customer support is{" "}
              <span className="text-primary">overwhelming</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDE29"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Overwhelmed by messages
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  50+ customer messages a day and you&apos;re the only one
                  answering. Important issues get buried in the noise.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83E\uDD37"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Inconsistent responses
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Some replies sound professional, others rushed. No templates,
                  no guidelines \u2014 every response is a blank canvas.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCC9"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  No ticket tracking
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Customer issues slip through the cracks. You forget to follow
                  up, and the customer feels ignored.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Support your customers{" "}
              <span className="text-primary">like a pro</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              AI-powered tools to handle customer issues quickly and
              professionally.
            </p>
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <span className="text-3xl">{f.icon}</span>
                  <h3 className="mt-4 text-lg font-semibold text-heading">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-body">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="bg-surface-light px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              How it <span className="text-primary">works</span>
            </h2>
            <div className="relative mt-16 grid gap-10 sm:grid-cols-3">
              <div className="pointer-events-none absolute top-7 left-[16.67%] right-[16.67%] hidden h-0.5 bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30 sm:block" />
              {steps.map((s) => (
                <div key={s.step} className="relative text-center">
                  <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-surface-light">
                    {s.step}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-heading">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-body">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WhatsApp Chat Demo */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              See it in <span className="text-primary">action</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-center text-body">
              Turn a customer complaint into a satisfied customer in seconds.
            </p>
            <div className="mx-auto mt-12 max-w-sm">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                {/* WhatsApp header */}
                <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/20">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect width="32" height="32" rx="8" fill="#6366f1" />
                      <path
                        d="M21 11C21 7 13 7 11 11C9 15 23 17 21 21C19 25 11 25 11 21"
                        stroke="white"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Swayat AI
                    </p>
                    <p className="text-xs text-white/70">online</p>
                  </div>
                </div>

                {/* Chat area */}
                <div className="space-y-3 bg-[#ece5dd] p-4">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Customer says order #456 hasn&apos;t arrived, it&apos;s
                        been 5 days
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:20 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-gray-800">
                        {"\uD83D\uDCDD"} Draft response for order #456:
                      </p>
                      <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                        <p>
                          Hi! I&apos;m sorry about the delay with your order
                          #456. I&apos;ve checked and it&apos;s currently in
                          transit \u2014 expected delivery by tomorrow.
                        </p>
                        <p className="mt-2">
                          As an apology, here&apos;s a 10% discount code for
                          your next order: <strong>SORRY10</strong>
                        </p>
                        <p className="mt-2">
                          I&apos;ll follow up once it&apos;s delivered. Thanks
                          for your patience!
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {"\uD83C\uDFAB"} Ticket #T-089 created (Priority: High)
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:20 AM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Perfect, send it
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:21 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-700">
                        {"\u2705"} Response sent to customer. Ticket #T-089
                        updated. I&apos;ll remind you to follow up tomorrow if
                        not resolved.
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:21 AM
                      </p>
                    </div>
                  </div>
                </div>

                {/* Input bar */}
                <div className="flex items-center gap-2 border-t border-slate-200 bg-[#f0f0f0] px-3 py-2">
                  <div className="flex-1 rounded-full bg-white px-4 py-2 text-sm text-gray-400">
                    Type a message...
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075e54]">
                    <svg
                      className="h-5 w-5 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-heading sm:text-4xl">
              Happy customers,{" "}
              <span className="text-primary">less stress.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join small businesses using Swayat AI to handle customer support
              professionally \u2014 without hiring a support team. All from
              WhatsApp.
            </p>
            <div className="mt-10">
              <a
                href="/#waitlist"
                className="inline-block rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
              >
                Join Waitlist
              </a>
              <p className="mt-4 text-sm text-muted">
                No credit card required. 100 free messages/month.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
