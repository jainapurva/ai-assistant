export default function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-20">
      {/* Gradient background blobs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-accent/15 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          Let me help you
          <br />
          <span className="bg-gradient-to-r from-primary-light to-accent bg-clip-text text-transparent">
            with your chaos
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400 sm:text-xl">
          Your personal AI assistant, right inside WhatsApp. Marketing, emails,
          scheduling, research — I handle it all so you can focus on what
          matters.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#signup"
            className="rounded-full bg-primary px-8 py-3.5 text-lg font-semibold transition hover:bg-primary-dark"
          >
            Get Started Free
          </a>
          <a
            href="#how-it-works"
            className="rounded-full border border-white/20 px-8 py-3.5 text-lg font-semibold transition hover:border-white/40 hover:bg-white/5"
          >
            How It Works
          </a>
        </div>
      </div>
    </section>
  );
}
