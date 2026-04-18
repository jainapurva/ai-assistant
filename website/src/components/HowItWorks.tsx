const steps = [
  {
    step: "1",
    title: "Sign up for free",
    description:
      "Create your account in seconds. Tell us about your business and we'll set up your AI assistant.",
  },
  {
    step: "2",
    title: "Tell it what you need",
    description:
      "Manage leads, send invoices, book appointments, run campaigns \u2014 just type what you want in plain English.",
  },
  {
    step: "3",
    title: "Watch your profit grow",
    description:
      "Your AI agents work 24/7 \u2014 responding to leads in seconds, following up automatically, and never dropping the ball.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-surface-light px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          From sign-up to <span className="text-primary">more profit</span> in
          3 steps
        </h2>

        <div className="relative mt-16 grid gap-10 sm:grid-cols-3">
          {/* Connector line (visible on sm+) */}
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

        {/* CTA */}
        <div className="mt-14 text-center">
          <a
            href="#signup"
            className="inline-block rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-primary-dark"
          >
            Get Started Free
          </a>
          <p className="mt-3 text-sm text-muted">
            No credit card required. Start in minutes.
          </p>
        </div>
      </div>
    </section>
  );
}
