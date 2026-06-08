import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const siteUrl = "https://swayat.com";

export const metadata: Metadata = {
  title: "Book a Demo — See Swayat AI in action | Swayat AI",
  description:
    "Book a 30-minute live demo with the Swayat team. We'll walk you through how AI agents handle invoicing, booking, marketing, and customer support on WhatsApp.",
  alternates: {
    canonical: `${siteUrl}/book-demo`,
  },
  openGraph: {
    title: "Book a Demo — Swayat AI",
    description:
      "Book a 30-minute live demo to see how Swayat AI agents run your business on WhatsApp.",
    url: `${siteUrl}/book-demo`,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Book a Demo | Swayat AI",
    description:
      "Book a 30-minute live demo with the Swayat team.",
  },
};

const bookingUrl = process.env.NEXT_PUBLIC_DEMO_BOOKING_URL ?? "";

export default function BookDemoPage() {
  return (
    <main className="min-h-screen bg-white text-heading">
      <Header />

      <section className="relative overflow-hidden px-6 pt-32 pb-12">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            Live demo — 30 minutes
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            See Swayat AI run your business
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-body">
            Pick a time that works for you. We&rsquo;ll walk through invoicing,
            booking, marketing, and customer support — all on WhatsApp,
            tailored to your business.
          </p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-4xl">
          {bookingUrl ? (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
              <iframe
                src={bookingUrl}
                title="Book a demo with Swayat AI"
                className="h-[800px] w-full"
                style={{ border: 0 }}
                frameBorder={0}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-surface-light p-12 text-center">
              <p className="text-lg font-medium text-heading">
                Booking is being set up.
              </p>
              <p className="mt-2 text-body">
                In the meantime, email{" "}
                <a
                  href="mailto:apurva@swayat.com"
                  className="font-medium text-primary hover:underline"
                >
                  apurva@swayat.com
                </a>{" "}
                to schedule a demo.
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
