function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="flex-none"
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="#16a34a"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GetStarted() {
  return (
    <section className="relative overflow-hidden bg-paper">
      <div
        className="pointer-events-none absolute -top-44 -right-44 h-[540px] w-[540px] rounded-full"
        style={{ background: "rgba(99,102,241,0.10)", filter: "blur(120px)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-44 -left-44 h-[520px] w-[520px] rounded-full"
        style={{ background: "rgba(6,182,212,0.08)", filter: "blur(120px)" }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-12 lg:py-24">
        {/* Editorial column */}
        <div>
          <div className="inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            <span className="inline-block h-px w-6 bg-primary/60" aria-hidden="true" />
            start free · no credit card
          </div>
          <h2 className="mt-5 font-serif text-[40px] leading-[0.98] tracking-[-0.025em] text-ink sm:text-[48px] lg:text-[54px]">
            Send your first
            <br />
            <em className="font-serif italic text-ink-2">message tonight.</em>
          </h2>
          <p className="mt-5 max-w-[420px] text-[15px] leading-[1.6] text-ink-2">
            Tell Swayat what you need. It builds, hosts, and replies for you —
            straight from WhatsApp. Most users have something live in under a
            minute.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
              <CheckIcon /> Free for the first 14 days
            </div>
            <div className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
              <CheckIcon /> No app, no editor, no setup
            </div>
            <div className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
              <CheckIcon /> Cancel from a single message
            </div>
          </div>
          <div className="mt-8 flex items-center gap-3">
            <a
              href="#signup"
              className="inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Get started free <span aria-hidden="true">→</span>
            </a>
            <a
              href="/book-demo"
              className="rounded-full border border-slate-900/[0.12] bg-white px-5 py-3 text-sm font-medium text-ink transition hover:border-slate-900/20"
            >
              Book a demo
            </a>
          </div>
        </div>

        {/* Signup card */}
        <div
          className="relative rounded-2xl border border-slate-900/[0.06] bg-white p-6 sm:p-7"
          style={{ boxShadow: "0 30px 60px -30px rgba(15,23,42,0.20)" }}
        >
          <div className="mb-4 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
            <span>step one of one</span>
            <span>~30 seconds</span>
          </div>
          <h3 className="font-serif text-[24px] italic text-ink">
            What&rsquo;s your number?
          </h3>
          <div className="mt-4 space-y-2.5">
            <div className="flex h-[46px] items-center rounded-xl border border-slate-200 bg-paper px-4 text-sm text-slate-500">
              +1 (650) 555 ·
            </div>
            <div className="flex h-[46px] items-center rounded-xl border-[1.5px] border-primary bg-white px-4 text-sm text-ink">
              <span>Tell Swayat what you need&hellip;</span>
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-[18px] w-[1.5px] animate-pulse bg-primary"
              />
            </div>
          </div>
          <a
            href="#signup"
            className="mt-3.5 flex h-[50px] items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold text-white transition hover:opacity-95"
            style={{
              background: "linear-gradient(90deg, #6366f1, #06b6d4)",
            }}
          >
            Start chatting on WhatsApp <span aria-hidden="true">→</span>
          </a>
          <div className="mt-4 flex items-center justify-between border-t border-slate-900/[0.08] pt-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
            <span className="inline-flex items-center gap-2 text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />
              live · 4,200+ businesses
            </span>
            <span>SOC2 · in progress</span>
          </div>
        </div>
      </div>
    </section>
  );
}
