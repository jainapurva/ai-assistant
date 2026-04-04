const stats = [
  { value: "100M+", label: "WhatsApp users in the US" },
  { value: "78%", label: "Buyers choose the first responder" },
  { value: "95%", label: "Message open rate on WhatsApp" },
  { value: "30 sec", label: "Setup time, no app to install" },
];

const businessTypes = [
  { icon: "\uD83C\uDFE0", label: "Real Estate Agents" },
  { icon: "\uD83D\uDCBB", label: "Freelancers" },
  { icon: "\uD83D\uDC87", label: "Salons & Spas" },
  { icon: "\uD83C\uDFEA", label: "Local Shops" },
  { icon: "\uD83D\uDCCA", label: "Consultants" },
  { icon: "\uD83D\uDED2", label: "Online Sellers" },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="bg-surface-light px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          Built for <span className="text-primary">businesses that want to grow</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-body">
          Whether you&apos;re a solo freelancer or a growing team, Swayat&apos;s
          AI agents handle the busywork so you can focus on revenue.
        </p>

        {/* Stats row */}
        <div className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-extrabold text-primary sm:text-4xl">
                {stat.value}
              </div>
              <p className="mt-2 text-sm text-body">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Business types */}
        <div className="mt-20">
          <h3 className="text-center text-lg font-semibold text-heading">
            AI agents for every type of business
          </h3>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {businessTypes.map((biz) => (
              <div
                key={biz.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-5 transition hover:border-primary/40 hover:shadow-sm"
              >
                <span className="text-3xl" role="img" aria-label={biz.label}>
                  {biz.icon}
                </span>
                <span className="text-sm font-medium text-heading">
                  {biz.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quote */}
        <blockquote className="mx-auto mt-20 max-w-2xl border-l-4 border-primary py-2 pl-6">
          <p className="text-lg leading-relaxed text-heading italic">
            &ldquo;Every hour you spend on admin is an hour you&apos;re not
            growing your business. We built Swayat to give that time back
            &mdash; and turn it into profit.&rdquo;
          </p>
        </blockquote>
      </div>
    </section>
  );
}
