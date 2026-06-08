import { EmailIcon } from "./Icons";

export default function CustomSolutions() {
  return (
    <section id="custom-solutions" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-10 text-center shadow-sm">
          <h2 className="text-3xl font-bold tracking-tight text-heading sm:text-4xl">
            Need something{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              custom?
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body">
            We also build custom AI solutions tailored to your business.
            Workflows, integrations, and agents designed around how you
            actually operate.
          </p>
          <p className="mt-6 text-body">
            For details and a conversation, reach out to us.
          </p>

          <a
            href="mailto:contact@swayat.com"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <EmailIcon size={18} />
            contact@swayat.com
          </a>
        </div>
      </div>
    </section>
  );
}
