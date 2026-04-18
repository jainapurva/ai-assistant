import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp Invoice Bot \u2014 Create & Send Invoices from WhatsApp | Swayat AI",
  description:
    "Create professional invoices, track payments, and send reminders \u2014 all from WhatsApp. No apps needed. AI-powered invoicing for small businesses.",
  keywords: [
    "WhatsApp invoice bot",
    "send invoice on WhatsApp",
    "invoice generator WhatsApp",
    "WhatsApp invoice generator",
    "invoice bot for small business",
    "AI invoice generator",
    "invoice automation WhatsApp",
    "WhatsApp billing software",
  ],
  alternates: {
    canonical: `${siteUrl}/features/invoicing`,
  },
  openGraph: {
    title: "WhatsApp Invoice Bot \u2014 Create & Send Invoices from WhatsApp",
    description:
      "Create professional invoices, track payments, and send reminders \u2014 all from WhatsApp. AI-powered invoicing for small businesses.",
    url: `${siteUrl}/features/invoicing`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Invoice Bot | Swayat AI",
    description:
      "Create and send invoices from WhatsApp. Track payments, send reminders, auto-calculate tax.",
  },
};

const features = [
  {
    icon: "\uD83D\uDCDD",
    title: "Create Invoices in Natural Language",
    description:
      "Just say who to invoice, what for, and how much. Swayat creates a professional invoice in seconds \u2014 no templates, no forms.",
  },
  {
    icon: "\uD83D\uDCB0",
    title: "Auto-Calculate Tax",
    description:
      "Swayat automatically adds sales tax based on your state and the client\u2019s location. Compliant invoices every time.",
  },
  {
    icon: "\uD83D\uDD14",
    title: "Payment Tracking & Reminders",
    description:
      "Track which invoices are paid, pending, or overdue. Swayat sends automatic reminders so you don\u2019t have to chase payments.",
  },
  {
    icon: "\u23F0",
    title: "Overdue Payment Alerts",
    description:
      "Get notified the moment an invoice goes past due. Swayat can even send a polite follow-up to the client on your behalf.",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "Monthly Revenue Reports",
    description:
      "Ask for a monthly summary and get total revenue, outstanding amounts, top clients, and payment trends \u2014 all in one message.",
  },
  {
    icon: "\uD83D\uDCC2",
    title: "Google Sheets Sync",
    description:
      "Every invoice is automatically logged to a Google Sheet. Your accountant gets a clean, organized record without extra work.",
  },
];

const steps = [
  {
    step: "1",
    title: "Tell Swayat to create an invoice",
    description:
      "Send a message like \u201CInvoice Sarah for logo design, $500.\u201D Swayat understands natural language \u2014 no forms needed.",
  },
  {
    step: "2",
    title: "Review and send",
    description:
      "Swayat creates a professional invoice with tax, due date, and payment details. Approve it and it\u2019s sent instantly.",
  },
  {
    step: "3",
    title: "Track and get paid",
    description:
      "Monitor payment status, get overdue alerts, and let Swayat send reminders. Everything syncs to Google Sheets.",
  },
];

export default function InvoicingPage() {
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
              Invoicing
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              Create &amp; Send Invoices{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                from WhatsApp
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              Stop wasting hours in Excel. Create professional, tax-compliant
              invoices by sending a simple WhatsApp message. Track payments,
              send reminders, and get monthly reports \u2014 all from one chat.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="/#signup"
                className="rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
              >
                Get Started
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
              Small business invoicing is{" "}
              <span className="text-primary">broken</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\u23F3"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Hours wasted in Excel
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Formatting rows, copying formulas, and manually calculating
                  tax for every single invoice.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDE35"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Lost track of payments
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  No system to know which invoices are paid, pending, or
                  overdue. Money slips through the cracks.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDE45"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Awkward payment chasing
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Nobody likes sending &ldquo;gentle reminder&rdquo; messages.
                  But you need to get paid.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Everything you need to{" "}
              <span className="text-primary">get paid faster</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Professional invoicing without the professional software price
              tag.
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
              A real conversation with Swayat AI. This is all it takes to create
              and send an invoice.
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
                        Invoice Sarah for logo design, $500
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        10:14 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-green-700">
                        {"\u2705"} Invoice #INV-2026-051 created
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-gray-700">
                        <p>
                          <span className="text-gray-500">Client:</span> Sarah
                          Miller
                        </p>
                        <p>
                          <span className="text-gray-500">Service:</span> Logo
                          Design
                        </p>
                        <p>
                          <span className="text-gray-500">Amount:</span>{" "}
                          $500.00 + $40.00 tax
                        </p>
                        <p>
                          <span className="text-gray-500">Total:</span>{" "}
                          $540.00
                        </p>
                        <p>
                          <span className="text-gray-500">Due:</span> April 14,
                          2026
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-gray-700">
                        Sent to sarah@studio.com {"\uD83D\uDCE8"}
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        10:14 AM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Add it to the Google Sheet too
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        10:15 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-700">
                        {"\u2705"} Added to &ldquo;2026 Invoices&rdquo; sheet,
                        row 51. Running total: $8,500.
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        10:15 AM
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
              Stop chasing payments.{" "}
              <span className="text-primary">Start getting paid.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join hundreds of small businesses using Swayat AI to create
              invoices, track payments, and get paid faster \u2014 all from
              WhatsApp.
            </p>
            <div className="mt-10">
              <a
                href="/#signup"
                className="inline-block rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
              >
                Get Started
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
