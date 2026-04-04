import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp Real Estate CRM \u2014 Lead Management for Agents | Swayat AI",
  description:
    "Manage leads, track properties, schedule showings, and automate follow-ups \u2014 all from WhatsApp. AI-powered CRM for real estate agents in the US.",
  keywords: [
    "WhatsApp real estate CRM",
    "real estate lead management WhatsApp",
    "real estate CRM USA",
    "property lead scoring AI",
    "real estate follow-up automation",
    "real estate agent tools",
    "WhatsApp CRM for realtors",
    "property management WhatsApp",
    "real estate agent tools USA",
    "lead management app for realtors",
  ],
  alternates: {
    canonical: `${siteUrl}/features/real-estate`,
  },
  openGraph: {
    title:
      "WhatsApp Real Estate CRM \u2014 Lead Management for Agents",
    description:
      "Manage leads, track properties, schedule showings, and automate follow-ups \u2014 all from WhatsApp. AI-powered CRM for real estate agents.",
    url: `${siteUrl}/features/real-estate`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Real Estate CRM | Swayat AI",
    description:
      "AI-powered lead management, property matching, and follow-up automation \u2014 all from WhatsApp.",
  },
};

const features = [
  {
    icon: "\uD83C\uDFAF",
    title: "Lead Capture & BANT Scoring",
    description:
      "Add leads with one message. Swayat automatically scores them as HOT, WARM, or COLD using BANT criteria (Budget, Authority, Need, Timeline) so you know exactly who to call first.",
  },
  {
    icon: "\uD83C\uDFE0",
    title: "Property Listing Management",
    description:
      "Maintain your full property inventory inside WhatsApp. Add new listings, update prices, mark as sold \u2014 all by sending a message.",
  },
  {
    icon: "\uD83E\uDD16",
    title: "AI Property Matching",
    description:
      "When a new lead comes in, Swayat instantly matches them against your listings based on location, budget, beds/baths, and preferences. You get a shortlist in seconds.",
  },
  {
    icon: "\uD83D\uDCC5",
    title: "Showing Scheduling",
    description:
      "Schedule site visits with one message. Swayat checks for conflicts, sends confirmations to clients, and adds it to your Google Calendar.",
  },
  {
    icon: "\uD83D\uDD04",
    title: "Follow-Up Automation",
    description:
      "Never lose a lead to slow follow-up again. Swayat reminds you to follow up with warm and hot leads, and can even send templated messages on your behalf.",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "Pipeline Dashboard",
    description:
      "Ask \u201CShow my pipeline\u201D and get a complete view: leads by stage, properties by status, showings this week, and conversion rates.",
  },
];

const steps = [
  {
    step: "1",
    title: "Add a lead",
    description:
      "Send the lead\u2019s details in natural language. Swayat captures name, budget, location, beds/baths, and scores them automatically.",
  },
  {
    step: "2",
    title: "Get matched properties",
    description:
      "Swayat searches your listings and suggests the best matches. Share property details with the client in one tap.",
  },
  {
    step: "3",
    title: "Close the deal",
    description:
      "Schedule showings, automate follow-ups, and track the entire pipeline \u2014 all from your WhatsApp.",
  },
];

export default function RealEstatePage() {
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
              Real Estate CRM
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              Real Estate CRM{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                on WhatsApp
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              The CRM built for how real estate agents actually work \u2014 on
              the phone, on the go, closing deals. Manage leads, match
              properties, schedule showings, and automate follow-ups. All from
              WhatsApp.
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
              Real estate agents are{" "}
              <span className="text-primary">losing deals</span> to disorganization
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCF1"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Juggling 5+ apps
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Contacts in your phone, leads in Excel, properties on Zillow and Realtor.com,
                  showings on Google Calendar, follow-ups in your head.
                  Nothing talks to each other.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\u23F0"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Missed follow-ups
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  You meant to call that hot lead back yesterday. Now
                  they&apos;ve gone with a faster-responding competitor. Lost
                  commission: $15,000+.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83E\uDD37"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  No lead prioritization
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Treating all leads equally means wasting time on tire-kickers
                  while hot leads go cold. You need a system that tells you who
                  to focus on.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Your complete real estate CRM,{" "}
              <span className="text-primary">in one chat</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Every tool you need to capture leads, match properties, and close
              deals \u2014 without leaving WhatsApp.
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

        {/* Lead Scoring Deep Dive */}
        <section className="bg-surface-light px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              AI-powered{" "}
              <span className="text-primary">lead scoring</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Swayat uses BANT criteria to automatically score every lead so you
              know exactly where to spend your time.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-600">
                    {"\uD83D\uDD25"}
                  </span>
                  <h3 className="text-lg font-bold text-red-600">
                    HOT (Score 70\u2013100)
                  </h3>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-body">
                  <li>{"\u2022"} Budget confirmed and realistic</li>
                  <li>{"\u2022"} Ready to buy within 30 days</li>
                  <li>{"\u2022"} Pre-approved loan or cash buyer</li>
                  <li>{"\u2022"} Specific location and bed/bath requirements</li>
                </ul>
                <p className="mt-4 text-sm font-medium text-red-600">
                  Action: Call within 1 hour
                </p>
              </div>
              <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-600">
                    {"\u2600\uFE0F"}
                  </span>
                  <h3 className="text-lg font-bold text-amber-600">
                    WARM (Score 40\u201369)
                  </h3>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-body">
                  <li>{"\u2022"} Budget range identified</li>
                  <li>{"\u2022"} Looking to buy within 1\u20133 months</li>
                  <li>{"\u2022"} Exploring options, not committed</li>
                  <li>{"\u2022"} General area preferences</li>
                </ul>
                <p className="mt-4 text-sm font-medium text-amber-600">
                  Action: Follow up within 24 hours
                </p>
              </div>
              <div className="rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
                    {"\u2744\uFE0F"}
                  </span>
                  <h3 className="text-lg font-bold text-blue-600">
                    COLD (Score 0\u201339)
                  </h3>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-body">
                  <li>{"\u2022"} Budget unclear or unrealistic</li>
                  <li>{"\u2022"} Timeline 3+ months out</li>
                  <li>{"\u2022"} Just browsing or researching</li>
                  <li>{"\u2022"} No specific requirements</li>
                </ul>
                <p className="mt-4 text-sm font-medium text-blue-600">
                  Action: Nurture with weekly updates
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Property Matching Deep Dive */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Instant{" "}
              <span className="text-primary">property matching</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              When a new lead comes in, Swayat searches your entire inventory
              and suggests the best matches \u2014 in seconds, not hours.
            </p>
            <div className="mx-auto mt-12 max-w-3xl">
              <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-semibold text-heading">
                  How AI matching works
                </h3>
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <h4 className="font-medium text-heading">
                      {"\uD83D\uDCE5"} Lead requirements
                    </h4>
                    <ul className="mt-3 space-y-2 text-sm text-body">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">{"\u2192"}</span>
                        Budget: up to $500K
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">{"\u2192"}</span>
                        Location: Westlake Hills, Austin TX
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">{"\u2192"}</span>
                        Type: 3BR/2BA single-family
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">{"\u2192"}</span>
                        Preference: New construction
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-heading">
                      {"\uD83C\uDFE0"} Matching properties
                    </h4>
                    <ul className="mt-3 space-y-2 text-sm text-body">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-green-600">
                          {"\u2713"}
                        </span>
                        Lakewood Estates, 3BR/2BA, $475K (95% match)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-green-600">
                          {"\u2713"}
                        </span>
                        Sunset Ridge, 3BR/2BA, $450K (88% match)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-amber-600">
                          {"\u25CB"}
                        </span>
                        The Meridian, 3BR/2BA, $520K (72% match)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Follow-Up System Deep Dive */}
        <section className="bg-surface-light px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Never miss a{" "}
              <span className="text-primary">follow-up</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Swayat tracks every lead interaction and reminds you to follow up
              at the right time. No lead falls through the cracks.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-heading">
                  {"\u23F0"} Automatic reminders
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-body">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    HOT leads: reminder within 1 hour
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    WARM leads: daily follow-up prompt
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    COLD leads: weekly check-in reminder
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    Post-showing: feedback collection in 24 hours
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-heading">
                  {"\uD83D\uDCE8"} Templated outreach
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-body">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    New property alerts matching lead preferences
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    Price-drop notifications for interested buyers
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    Market update emails for nurturing cold leads
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">{"\u2022"}</span>
                    Post-showing thank you messages
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              How it <span className="text-primary">works</span>
            </h2>
            <div className="relative mt-16 grid gap-10 sm:grid-cols-3">
              <div className="pointer-events-none absolute top-7 left-[16.67%] right-[16.67%] hidden h-0.5 bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30 sm:block" />
              {steps.map((s) => (
                <div key={s.step} className="relative text-center">
                  <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-white">
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
        <section className="bg-surface-light px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              See it in <span className="text-primary">action</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-center text-body">
              Add a lead and get matched properties in one conversation.
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
                        New lead: Mike, wants 3BR/2BA in Westlake Hills under $500K
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:30 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-green-700">
                        {"\u2705"} Lead L-0042 created
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-gray-700">
                        <p>
                          <span className="text-gray-500">Name:</span> Mike
                        </p>
                        <p>
                          <span className="text-gray-500">Looking for:</span>{" "}
                          3BR/2BA, Westlake Hills, Austin TX
                        </p>
                        <p>
                          <span className="text-gray-500">Budget:</span> up to
                          $500K
                        </p>
                        <p>
                          <span className="text-gray-500">Score:</span>{" "}
                          <span className="font-semibold text-red-600">
                            HOT (80/100)
                          </span>{" "}
                          {"\uD83D\uDD25"}
                        </p>
                      </div>
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-sm font-medium text-gray-800">
                          {"\uD83C\uDFE0"} 3 matching properties:
                        </p>
                        <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                          <p>
                            1. Lakewood Estates, 3BR/2BA \u2014 $475K (95%
                            match)
                          </p>
                          <p>
                            2. Sunset Ridge, 3BR/2BA \u2014 $450K (88% match)
                          </p>
                          <p>
                            3. The Meridian, 3BR/2BA \u2014 $520K (72% match)
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Schedule a showing?
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:30 AM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Schedule Lakewood Estates showing for Saturday 11am
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:31 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-700">
                        {"\u2705"} Showing scheduled:
                      </p>
                      <div className="mt-1 space-y-0.5 text-sm text-gray-600">
                        <p>Mike {"\u2192"} Lakewood Estates (3BR/2BA)</p>
                        <p>Saturday, April 4 at 11:00 AM</p>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Added to Google Calendar. Mike will get a reminder
                        tomorrow.
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        11:31 AM
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

        {/* Social Proof / Stats */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Built for{" "}
              <span className="text-primary">US real estate agents</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-4xl font-extrabold text-primary">2x</p>
                <p className="mt-2 text-sm text-body">
                  Faster lead response time
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-primary">0</p>
                <p className="mt-2 text-sm text-body">
                  Missed follow-ups
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-primary">100%</p>
                <p className="mt-2 text-sm text-body">
                  WhatsApp-based workflow
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-primary">$9.99</p>
                <p className="mt-2 text-sm text-body">/month for everything</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-heading sm:text-4xl">
              Close more deals.{" "}
              <span className="text-primary">Lose fewer leads.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join real estate agents across the US who use Swayat AI to manage
              leads, match properties, and close deals faster \u2014 all from
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
