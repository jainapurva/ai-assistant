const steps = [
  {
    step: "1",
    title: "Enter your phone number",
    description: "Sign up with your WhatsApp number. Got a promo code? Even better — unlock a free trial.",
  },
  {
    step: "2",
    title: "Open WhatsApp",
    description: "Tap the link we give you. It opens a chat with your new AI assistant — no installs needed.",
  },
  {
    step: "3",
    title: "Start chatting",
    description: "Ask anything. Get help with work, creative projects, research, or just your daily chaos.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          Up and running in{" "}
          <span className="text-primary-light">30 seconds</span>
        </h2>
        <div className="mt-16 grid gap-10 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary-light">
                {s.step}
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
