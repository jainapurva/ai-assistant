import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title:
    "WhatsApp Appointment Booking \u2014 Schedule & Manage Bookings | Swayat AI",
  description:
    "Let customers book appointments through WhatsApp. Automatic confirmations, reminders, and rescheduling. Perfect for salons, clinics, consultants.",
  keywords: [
    "WhatsApp appointment booking",
    "WhatsApp booking system",
    "appointment bot WhatsApp",
    "WhatsApp scheduling bot",
    "salon booking WhatsApp",
    "clinic appointment WhatsApp",
    "booking automation WhatsApp",
    "appointment reminder WhatsApp",
  ],
  alternates: {
    canonical: `${siteUrl}/features/booking`,
  },
  openGraph: {
    title:
      "WhatsApp Appointment Booking \u2014 Schedule & Manage Bookings",
    description:
      "Automatic confirmations, reminders, and rescheduling. Perfect for salons, clinics, and consultants.",
    url: `${siteUrl}/features/booking`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Appointment Booking | Swayat AI",
    description:
      "Let customers book appointments through WhatsApp. Automatic confirmations and reminders.",
  },
};

const features = [
  {
    icon: "\uD83D\uDDE3\uFE0F",
    title: "Natural Language Booking",
    description:
      "Say \u201CBook Anita for facial tomorrow 3pm\u201D and it\u2019s done. No forms, no dropdowns \u2014 just tell Swayat what you need.",
  },
  {
    icon: "\u2705",
    title: "Auto-Confirmations",
    description:
      "Clients get instant booking confirmations with date, time, service, and your business details. Professional and automatic.",
  },
  {
    icon: "\uD83D\uDD14",
    title: "Smart Reminders",
    description:
      "Swayat sends reminders 24 hours and 1 hour before appointments. Reduce no-shows by up to 70%.",
  },
  {
    icon: "\u26A0\uFE0F",
    title: "Conflict Detection",
    description:
      "Double booking? Swayat catches it instantly and suggests the next available slot. No more overlapping appointments.",
  },
  {
    icon: "\uD83D\uDCC5",
    title: "Daily Schedule View",
    description:
      "Ask \u201CWhat\u2019s my schedule today?\u201D and get a clean summary of all appointments with times, clients, and services.",
  },
  {
    icon: "\uD83D\uDD04",
    title: "Google Calendar Sync",
    description:
      "Every booking syncs to Google Calendar. See your appointments alongside personal events \u2014 one calendar for everything.",
  },
];

const steps = [
  {
    step: "1",
    title: "Create a booking",
    description:
      "Message Swayat with the client name, service, date, and time. It handles the rest.",
  },
  {
    step: "2",
    title: "Automatic confirmation",
    description:
      "The client gets a confirmation message. A reminder goes out 24 hours before the appointment.",
  },
  {
    step: "3",
    title: "Manage your day",
    description:
      "Ask for your daily schedule, reschedule appointments, or check availability \u2014 all from WhatsApp.",
  },
];

export default function BookingPage() {
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
              Appointment Booking
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
              Appointment Booking{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                on WhatsApp
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
              Stop playing phone tag. Let Swayat AI manage your appointments
              \u2014 bookings, confirmations, reminders, and rescheduling \u2014
              all from one WhatsApp conversation.
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
              Appointment scheduling is a{" "}
              <span className="text-primary">nightmare</span>
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDE45"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Missed appointments
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Clients forget, you forget to remind them. No-shows cost you
                  time and money every week.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCA5"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Double bookings
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Managing appointments across WhatsApp, calls, and walk-ins
                  leads to embarrassing scheduling conflicts.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-3xl">{"\uD83D\uDCDE"}</span>
                <h3 className="mt-4 text-lg font-semibold text-heading">
                  Phone tag
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  Back-and-forth calls just to find a time that works. You spend
                  more time scheduling than serving clients.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
              Never miss a booking{" "}
              <span className="text-primary">again</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body">
              Swayat AI handles scheduling so you can focus on serving your
              clients.
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
              Book an appointment in seconds. Here&apos;s a real conversation
              with Swayat AI.
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
                        Book Anita for facial tomorrow 3pm
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:45 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-green-700">
                        {"\u2705"} Appointment booked!
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-gray-700">
                        <p>
                          <span className="text-gray-500">Client:</span> Anita
                          Desai
                        </p>
                        <p>
                          <span className="text-gray-500">Service:</span> Facial
                          Treatment
                        </p>
                        <p>
                          <span className="text-gray-500">Date:</span> March 30,
                          2026
                        </p>
                        <p>
                          <span className="text-gray-500">Time:</span> 3:00 PM
                          \u2013 4:00 PM
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-gray-700">
                        Confirmation sent to Anita {"\uD83D\uDCE8"}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Reminder will be sent at 3:00 PM today
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:45 AM
                      </p>
                    </div>
                  </div>

                  {/* User follow-up */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-gray-800">
                        What&apos;s my schedule tomorrow?
                      </p>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:46 AM
                      </p>
                    </div>
                  </div>

                  {/* Bot response 2 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-gray-800">
                        {"\uD83D\uDCC5"} Tomorrow, March 30:
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-gray-700">
                        <p>10:00 AM \u2013 Priya (Haircut)</p>
                        <p>11:30 AM \u2013 Kavita (Manicure)</p>
                        <p>1:00 PM \u2013 Lunch break</p>
                        <p className="font-medium text-primary">
                          3:00 PM \u2013 Anita (Facial) {"\u2728"}
                        </p>
                        <p>4:30 PM \u2013 Sneha (Hair Color)</p>
                      </div>
                      <p className="mt-1 text-right text-[10px] text-gray-500">
                        9:46 AM
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
              Stop losing clients to{" "}
              <span className="text-primary">no-shows.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">
              Join salons, clinics, and consultants who use Swayat AI to
              manage bookings, send reminders, and fill their schedules
              \u2014 all from WhatsApp.
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
