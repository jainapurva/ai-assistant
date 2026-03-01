const features = [
  {
    icon: "📢",
    title: "Marketing",
    description:
      "Draft social posts, plan campaigns, write ad copy, and brainstorm content ideas — all conversationally.",
  },
  {
    icon: "📧",
    title: "Email Management",
    description:
      "Compose emails, summarize threads, draft replies, and manage your inbox without leaving WhatsApp.",
  },
  {
    icon: "📅",
    title: "Scheduling",
    description:
      "Set reminders, plan your week, coordinate meetings, and keep your calendar organized.",
  },
  {
    icon: "🛠️",
    title: "Building Things",
    description:
      "Write code, debug problems, create scripts, and prototype ideas with a capable coding partner.",
  },
  {
    icon: "🔍",
    title: "Research",
    description:
      "Deep-dive into any topic, summarize articles, compare options, and get well-structured analysis.",
  },
  {
    icon: "💬",
    title: "All from WhatsApp",
    description:
      "No new apps to install. No learning curve. Just message like you would a friend — and get things done.",
  },
];

export default function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          Everything you need,{" "}
          <span className="text-primary-light">one chat away</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-gray-400">
          No matter what you&apos;re working on, your assistant is ready to jump
          in and help.
        </p>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-surface-light p-6 transition hover:border-primary/30 hover:bg-surface-lighter"
            >
              <span className="text-3xl">{f.icon}</span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
