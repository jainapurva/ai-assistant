const differentiators = [
  {
    icon: "\uD83E\uDDE0",
    title: "Agentic AI, Not Chatbots",
    description:
      "Swayat doesn\u2019t just answer questions \u2014 it takes action. Our AI agents autonomously handle invoicing, lead qualification, follow-ups, and scheduling. They work while you sleep.",
  },
  {
    icon: "\uD83D\uDCB0",
    title: "More Revenue, Lower Costs",
    description:
      "Every missed follow-up is lost revenue. Every hour on admin is an hour not selling. Swayat\u2019s agents eliminate the gap \u2014 so you close more deals with less overhead.",
  },
  {
    icon: "\u26A1",
    title: "Works in 30 Seconds",
    description:
      "No software to install. No dashboards to learn. No onboarding calls. Sign up with your WhatsApp number, and your AI agents are ready immediately.",
  },
  {
    icon: "\uD83D\uDD12",
    title: "Enterprise AI at Small Business Prices",
    description:
      "Fortune 500 companies spend millions on AI automation. Swayat gives you the same capability for $9.99/month. The ROI isn\u2019t a question \u2014 it\u2019s a guarantee.",
  },
];

const results = [
  { value: "5.6 hrs", label: "Saved per week on admin" },
  { value: "3x", label: "Faster lead response" },
  { value: "40%", label: "More deals closed" },
  { value: "$0", label: "Extra software needed" },
];

export default function About() {
  return (
    <section id="about" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          AI That <span className="text-primary">Grows Your Business</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-body">
          Not another tool. A team of AI agents that work for you 24/7.
        </p>

        {/* Mission copy */}
        <div className="mx-auto mt-10 max-w-3xl space-y-5 text-center text-body leading-relaxed">
          <p>
            Swayat is an AI company on a mission: <strong className="text-heading">make every small
            business more profitable.</strong> We build agentic workflows
            that handle the work you shouldn&apos;t be doing manually &mdash;
            invoicing, lead management, appointment scheduling, marketing,
            and customer support.
          </p>
          <p>
            If you&apos;re a business owner exploring AI, here&apos;s our
            promise: <strong className="text-heading">we will improve your revenue at the lowest
            cost possible, making your net profit higher than before.</strong> Not
            someday. Not maybe. That&apos;s the guarantee.
          </p>
        </div>

        {/* Differentiator grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {differentiators.map((d) => (
            <div
              key={d.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <span className="text-2xl">{d.icon}</span>
              <h3 className="mt-3 text-lg font-semibold text-heading">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">
                {d.description}
              </p>
            </div>
          ))}
        </div>

        {/* Results row */}
        <div className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.02] p-8">
          <h3 className="text-center text-lg font-semibold text-heading">
            The impact on your business
          </h3>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {results.map((r) => (
              <div key={r.label} className="text-center">
                <div className="text-3xl font-bold text-primary">{r.value}</div>
                <p className="mt-2 text-sm text-body">{r.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
