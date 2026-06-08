export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-stage text-white">
      <div
        className="pointer-events-none absolute -top-52 -left-32 h-[520px] w-[520px] rounded-full"
        style={{ background: "rgba(99,102,241,0.30)", filter: "blur(140px)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-52 -right-32 h-[520px] w-[520px] rounded-full"
        style={{ background: "rgba(6,182,212,0.25)", filter: "blur(140px)" }}
        aria-hidden="true"
      />
      <div className="bg-stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <div
        className="relative mx-auto max-w-[1180px] px-6 sm:px-10 lg:px-14"
        style={{ paddingTop: "clamp(120px, 16vh, 160px)", paddingBottom: "clamp(64px, 12vh, 96px)" }}
      >
        {/* Top row: eyebrow + stats */}
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-indigo-300">
            <span className="inline-block h-px w-6 bg-indigo-300/60" aria-hidden="true" />
            live demo · 12 seconds
          </div>
          <div className="flex gap-6 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
            <span>
              <b className="font-medium text-white">4,200+</b> sites built
            </span>
            <span>
              <b className="font-medium text-white">0</b> dashboards
            </span>
          </div>
        </div>

        {/* Headline */}
        <h1
          className="font-serif text-[44px] leading-[1.0] tracking-[-0.02em] text-white sm:text-[52px] lg:text-[56px]"
          style={{ marginBottom: "32px", maxWidth: "560px" }}
        >
          One message in.
          <br />
          <em className="font-serif italic text-white/70">A live website out.</em>
        </h1>

        {/* Framed video */}
        <div
          className="relative overflow-hidden rounded-2xl border border-white/[0.08]"
          style={{
            background: "#1d1b16",
            boxShadow:
              "0 60px 120px -30px rgba(99,102,241,0.45), inset 0 0 0 1px rgba(99,102,241,0.18)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5">
            <span className="h-[9px] w-[9px] rounded-full bg-white/[0.16]" />
            <span className="h-[9px] w-[9px] rounded-full bg-white/[0.16]" />
            <span className="h-[9px] w-[9px] rounded-full bg-white/[0.16]" />
            <span className="ml-3 inline-flex flex-1 items-center gap-2 rounded-full bg-white/5 px-3.5 py-1 font-mono text-[11px] text-white/55">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-green-500" aria-hidden="true" />
              emma-babyshower.swayat.com · live
            </span>
          </div>
          <video
            className="block aspect-[16/10] w-full object-cover"
            src="/videos/rsvp-slideshow.mp4"
            poster="/videos/rsvp-slideshow-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label="Swayat builds an RSVP website from a single WhatsApp message"
          />
        </div>

        {/* Caption row */}
        <div className="mt-8 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <p className="max-w-[420px] text-[13.5px] leading-[1.55] text-white/65">
            Watch Swayat parse a single WhatsApp message and ship a real RSVP
            page to its own subdomain — no app, no editor, no template picker.
          </p>
          <a
            href="#signup"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-white/90"
          >
            Get started free <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
