import { LogoIcon } from "./Logo";
import { PlayIcon, SendIcon } from "./Icons";
import VideoModal from "./VideoModal";

export default function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-24 pb-20">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-accent/10 blur-[100px]" />
      <div className="pointer-events-none absolute top-1/3 -left-20 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[80px]" />

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <div className="mb-6 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            AI agents that actually run your business
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-heading sm:text-5xl lg:text-6xl">
            Grow Revenue.
            <br />
            Cut Costs.
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Keep More Profit.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-body lg:mx-0">
            Swayat AI deploys intelligent agents that handle invoicing, lead
            management, appointments, marketing, and customer support &mdash;
            so you can focus on what matters.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="#signup"
              className="rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
            >
              Get Started Free
            </a>
            <VideoModal
              src="/videos/swayat-demo-invoice.mp4"
              trigger={
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-8 py-3.5 text-lg font-semibold text-heading transition hover:border-primary hover:bg-primary/5">
                  <PlayIcon size={20} className="text-primary" />
                  See How It Works
                </span>
              }
            />
          </div>
          <p className="mt-6 text-sm text-muted">
            No app to install. No dashboard to learn. Just WhatsApp.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            Now open &mdash; sign up and start in minutes
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm lg:mx-0 lg:ml-auto">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white">
                <LogoIcon size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Swayat AI</p>
                <p className="text-xs text-white/70">online</p>
              </div>
            </div>

            <div className="space-y-3 bg-[#ece5dd] p-4">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 shadow-sm">
                  <p className="text-sm text-gray-800">
                    Invoice Sarah for 5 hours web design at $150/hr
                  </p>
                  <p className="mt-1 text-right text-[10px] text-gray-500">
                    10:32 AM
                  </p>
                </div>
              </div>

              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
                  <p className="text-sm font-medium text-green-700">
                    {"\u2705"} Invoice #INV-2026-047 created
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                    <p>
                      <span className="text-gray-500">Client:</span> Sarah Chen
                    </p>
                    <p>
                      <span className="text-gray-500">Amount:</span> $750
                    </p>
                    <p>
                      <span className="text-gray-500">Due:</span> April 15, 2026
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    Sent to sarah@example.com
                  </p>
                  <p className="mt-1 text-right text-[10px] text-gray-500">
                    10:32 AM
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 bg-[#f0f0f0] px-3 py-2">
              <div className="flex-1 rounded-full bg-white px-4 py-2 text-sm text-gray-400">
                Type a message...
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075e54] text-white">
                <SendIcon size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
