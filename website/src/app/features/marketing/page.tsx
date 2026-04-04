import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp Marketing Automation \u2014 AI Content & Campaigns | Swayat AI",
  description:
    "Create social media posts, email campaigns, and ad copy \u2014 all from WhatsApp. AI-powered marketing assistant for small businesses.",
  keywords: [
    "WhatsApp marketing automation",
    "WhatsApp marketing tool",
    "AI marketing assistant",
    "social media content creator AI",
    "WhatsApp campaign tool",
    "AI content writer WhatsApp",
    "small business marketing AI",
    "Instagram post generator AI",
  ],
  alternates: {
    canonical: `${siteUrl}/features/marketing`,
  },
  openGraph: {
    title:
      "WhatsApp Marketing Automation \u2014 AI Content & Campaigns",
    description:
      "Create social media posts, email campaigns, and ad copy \u2014 all from WhatsApp. AI-powered marketing for small businesses.",
    url: `${siteUrl}/features/marketing`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Marketing Assistant on WhatsApp | Swayat AI",
    description:
      "Create social media posts, email campaigns, and ad copy from WhatsApp.",
  },
};

const features = [
  {
    icon: "\uD83D\uDCF1",
    title: "Social Media Post Creation",
    description:
      "Tell Swayat what to promote and it creates ready-to-post content with captions, hashtags, and call-to-actions tailored to Instagram, Facebook, and LinkedIn.",
  },
  {
    icon: "\uD83D\uDCE7",
    title: "Email Campaign Drafts",
    description:
      "Draft promotional emails, newsletters, and follow-up sequences. Swayat writes in your brand voice with proper subject lines and CTAs.",
  },
  {
    icon: "\uD83C\uDFAF",
    title: "Ad Copywriting",
    description:
      "Get Google Ads, Facebook Ads, and Instagram Ads copy in seconds. Multiple variations so you can A/B test without hiring a copywriter.",
  },
  {
    icon: "\uD83D\uDCC6",
    title: "Content Calendars",
    description:
      "Ask Swayat to plan a month of content. Get a full calendar with post ideas, themes, and scheduling suggestions for every platform.",
  },
  {
    icon: "\uD83D\uDD0D",
    title: "Competitor Analysis",
    description:
      "Share a competitor\u2019s profile and Swayat analyzes their content strategy, posting frequency, and what\u2019s working \u2014 so you can do it better.",
  },
  {
    icon: "#\uFE0F\u20E3",
    title: "Hashtag Optimization",
    description:
      "Get researched, relevant hashtags for every post. Mix of high-reach and niche tags to maximize visibility without looking spammy.",
  },
];

const steps = [
  {
    step: "1",
    title: "Tell Swayat what to promote",
    description:
      "Describe your product, event, or sale. Swayat understands your business context.",
  },
  {
    step: "2",
    title: "Get ready-to-publish content",
    description:
      "Receive posts, emails, or ad copy with captions, hashtags, and CTAs \u2014 formatted for each platform.",
  },
  {
    step: "3",
    title: "Publish or schedule",
    description:
      "Copy-paste to your platforms or let Swayat schedule posts. Track what\u2019s working and iterate.",
  },
];

export default function MarketingPage() {
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
              Marketing
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              AI Marketing Assistant{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                on WhatsApp
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              You don&apos;t need a marketing agency. Create social media posts,
              email campaigns, and ad copy \u2014 all by sending a WhatsApp
              message to your AI marketing assistant.
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
              Great marketing shouldn&apos;t cost{" "}
              <span className="text-primary">a fortune</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCB8"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Agencies are expensive
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Marketing agencies charge $2,000+/month. That&apos;s
                  not realistic for a small business or solo founder.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83E\uDD14"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  No time to create content
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  You know you should post regularly, but running a business
                  leaves no time for writing captions and planning campaigns.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCC9"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Inconsistent posting
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  You post for a week, then nothing for a month. Inconsistency
                  kills your reach and makes your brand look inactive.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Your marketing team,{" "}
              <span className="text-primary">in your pocket</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Professional marketing content created in seconds, not days.
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
              Create a week of social media content in one message. Here&apos;s
              how.
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
                        Write 5 Instagram posts for my bakery&apos;s Diwali sale
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        2:30 PM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-green-700">
                        {"\u2705"} 5 Instagram posts ready!
                      </p>
                      <div className="mt-2 space-y-2 text-sm text-gray-700">
                        <div>
                          <p className="font-medium">Post 1: Teaser</p>
                          <p className="text-gray-600">
                            &ldquo;Something sweet is coming this Diwali...
                            {"\uD83C\uDF6A\u2728"} Stay tuned!&rdquo;
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Post 2: Sale Announcement</p>
                          <p className="text-gray-600">
                            &ldquo;Our Diwali Sale is LIVE! 20% off all gift
                            boxes...&rdquo;
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Post 3: Behind the Scenes</p>
                          <p className="text-gray-600">
                            &ldquo;Watch us prepare 500 ladoos for your
                            Diwali...&rdquo;
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        + 2 more posts with hashtags
                      </p>
                      <p className="mt-2 text-sm text-gray-700">
                        Want me to create a posting schedule?
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        2:31 PM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        Yes, schedule them for this week
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        2:31 PM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-700">
                        {"\uD83D\uDCC5"} Schedule set: Mon 10am, Tue 6pm, Wed
                        12pm, Thu 10am, Fri 6pm. I&apos;ll remind you to post
                        each one!
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        2:32 PM
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
              Marketing made{" "}
              <span className="text-primary">effortless.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join small businesses using Swayat AI to create professional
              marketing content \u2014 without the agency price tag. All from
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
