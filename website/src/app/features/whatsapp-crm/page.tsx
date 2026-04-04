import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp CRM for Small Business \u2014 All-in-One AI CRM | Swayat AI",
  description:
    "The only WhatsApp CRM powered by real AI. Manage customers, track leads, send invoices, book appointments \u2014 all from one WhatsApp conversation. Start free.",
  keywords: [
    "WhatsApp CRM",
    "WhatsApp CRM for small business",
    "CRM on WhatsApp",
    "AI CRM WhatsApp",
    "small business CRM",
    "WhatsApp business CRM",
    "all-in-one CRM WhatsApp",
  ],
  alternates: {
    canonical: `${siteUrl}/features/whatsapp-crm`,
  },
  openGraph: {
    title:
      "WhatsApp CRM for Small Business \u2014 All-in-One AI CRM",
    description:
      "The only WhatsApp CRM powered by real AI. Manage customers, track leads, send invoices, book appointments \u2014 all from one conversation.",
    url: `${siteUrl}/features/whatsapp-crm`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp CRM for Small Business | Swayat AI",
    description:
      "All-in-one AI CRM on WhatsApp. Invoicing, booking, marketing, support \u2014 one conversation.",
  },
};

const features = [
  {
    icon: "\uD83E\uDD16",
    title: "7 AI Agents, One Chat",
    description:
      "Invoicing, booking, marketing, customer support, real estate CRM, email management, and business insights \u2014 all accessible from a single WhatsApp conversation.",
  },
  {
    icon: "\uD83D\uDDE3\uFE0F",
    title: "Natural Language Commands",
    description:
      "No menus, no buttons, no flows. Just type what you need in plain English. Swayat understands context and intent.",
  },
  {
    icon: "\uD83D\uDCF2",
    title: "No App to Install",
    description:
      "Works inside WhatsApp \u2014 the app you already use every day. No downloads, no logins, no new interface to learn.",
  },
  {
    icon: "\uD83D\uDD17",
    title: "Google Workspace Integration",
    description:
      "Connect Gmail, Calendar, Drive, and Sheets with one tap. Your CRM syncs with the tools your business already relies on.",
  },
  {
    icon: "\uD83D\uDCF1",
    title: "Works on Any Phone",
    description:
      "Android, iPhone, even a &#36;200 smartphone. If it runs WhatsApp, it runs Swayat. No premium hardware required.",
  },
  {
    icon: "\uD83D\uDCB0",
    title: "Just &#36;9.99/month",
    description:
      "Traditional CRMs cost &#36;50\u2013&#36;200/month per user. Swayat gives you more power at a fraction of the price. Start free.",
  },
];

const steps = [
  {
    step: "1",
    title: "Sign up with your number",
    description:
      "Enter your WhatsApp number on our website. You&apos;ll get a message from Swayat AI within seconds.",
  },
  {
    step: "2",
    title: "Connect your Google account",
    description:
      "One-tap OAuth to link Gmail, Calendar, and Sheets. Your data stays yours \u2014 encrypted end-to-end.",
  },
  {
    step: "3",
    title: "Start running your business",
    description:
      "Send invoices, book appointments, manage leads, create marketing content \u2014 all from one WhatsApp chat.",
  },
];

export default function WhatsAppCRMPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-32 pb-20">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-accent/10 blur-[100px]" />
          <div className="pointer-events-none absolute top-1/3 -left-20 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[80px]" />
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              WhatsApp CRM
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              WhatsApp CRM{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                for Small Business
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              The only CRM that lives inside WhatsApp. Manage customers, track
              leads, send invoices, book appointments, and run marketing
              campaigns \u2014 all from the app your customers already use.
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
              Traditional CRMs don&apos;t work{" "}
              <span className="text-primary">for small businesses</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCB8"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Too expensive
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Salesforce, HubSpot, Zoho \u2014 they cost $50+/month
                  per user. That&apos;s not built for a 3-person team.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDE35"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Too complex
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Dashboards, pipelines, workflows, integrations \u2014 you need
                  a week of training just to add a contact. Your team gives up
                  in a month.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCBB"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Needs a laptop
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Most CRMs are desktop-first. But you run your business from
                  your phone. Your CRM should live where you already are
                  \u2014 WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Everything you need,{" "}
              <span className="text-primary">one chat away</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              A complete business operating system that fits in your pocket.
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
                  <p
                    className="mt-2 text-sm leading-relaxed text-body"
                    dangerouslySetInnerHTML={{ __html: f.description }}
                  />
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
              Your entire business dashboard, inside one WhatsApp chat.
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
                        Show me today&apos;s tasks
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:00 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-gray-800">
                        {"\uD83D\uDCCB"} Today&apos;s overview:
                      </p>
                      <div className="mt-2 space-y-2 text-sm text-gray-700">
                        <div>
                          <p className="font-medium">
                            {"\uD83E\uDDFE"} Invoices
                          </p>
                          <p className="text-gray-600">
                            3 pending ($1,500 outstanding)
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {"\uD83D\uDCC5"} Appointments
                          </p>
                          <p className="text-gray-600">
                            2 today: Sarah 10am, Emma 3pm
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {"\uD83C\uDFE0"} Leads
                          </p>
                          <p className="text-gray-600">
                            5 need follow-up (2 hot, 3 warm)
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {"\uD83C\uDFA7"} Support
                          </p>
                          <p className="text-gray-600">
                            1 open ticket (Priority: High)
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        What would you like to tackle first?
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:00 AM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Send reminders to overdue invoices
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:01 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-700">
                        {"\u2705"} Payment reminders sent to 3 clients:
                      </p>
                      <div className="mt-1 space-y-0.5 text-sm text-gray-600">
                        <p>
                          {"\u2022"} Sarah ($500 \u2014 7 days overdue)
                        </p>
                        <p>
                          {"\u2022"} Mike ($750 \u2014 3 days overdue)
                        </p>
                        <p>
                          {"\u2022"} Lisa ($350 \u2014 1 day overdue)
                        </p>
                      </div>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:01 AM
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

        {/* Comparison */}
        <section className="bg-surface-light px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Swayat vs.{" "}
              <span className="text-primary">traditional CRMs</span>
            </h2>
            <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-surface-light">
                    <th className="px-6 py-4 font-semibold text-heading">
                      Feature
                    </th>
                    <th className="px-6 py-4 font-semibold text-primary">
                      Swayat AI
                    </th>
                    <th className="px-6 py-4 font-semibold text-muted">
                      Traditional CRM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-6 py-3 text-body">Interface</td>
                    <td className="px-6 py-3 text-heading">WhatsApp chat</td>
                    <td className="px-6 py-3 text-body">Web dashboard</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-body">Learning curve</td>
                    <td className="px-6 py-3 text-heading">Zero</td>
                    <td className="px-6 py-3 text-body">Days to weeks</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-body">Price</td>
                    <td className="px-6 py-3 text-heading">$9.99/mo</td>
                    <td className="px-6 py-3 text-body">
                      $50+/mo/user
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-body">App required</td>
                    <td className="px-6 py-3 text-heading">No (WhatsApp)</td>
                    <td className="px-6 py-3 text-body">Yes</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-body">AI-powered</td>
                    <td className="px-6 py-3 text-heading">
                      Real AI (Claude)
                    </td>
                    <td className="px-6 py-3 text-body">
                      Basic automation
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-body">Works on</td>
                    <td className="px-6 py-3 text-heading">Any phone</td>
                    <td className="px-6 py-3 text-body">Desktop/tablet</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-heading sm:text-4xl">
              Your business deserves a{" "}
              <span className="text-primary">smarter CRM.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join hundreds of small businesses running their operations from
              WhatsApp. Invoicing, booking, marketing, support \u2014 all in one
              AI-powered conversation.
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
