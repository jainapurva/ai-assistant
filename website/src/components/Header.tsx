import { Logo } from "./Logo";

export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="/" className="transition hover:opacity-80">
          <Logo iconSize={28} />
        </a>
        <nav className="flex items-center gap-6">
          <div className="group relative hidden sm:inline-block">
            <a
              href="/#features"
              className="text-sm text-body transition hover:text-heading"
            >
              Features
            </a>
            <div className="pointer-events-none absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <a href="/features/invoicing" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">Invoicing</a>
                <a href="/features/booking" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">Booking</a>
                <a href="/features/marketing" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">Marketing</a>
                <a href="/features/real-estate" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">Real Estate CRM</a>
                <a href="/features/customer-support" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">Customer Support</a>
                <a href="/features/whatsapp-crm" className="block rounded-lg px-3 py-2 text-sm text-body transition hover:bg-surface-light hover:text-heading">WhatsApp CRM</a>
              </div>
            </div>
          </div>
          <a
            href="/#pricing"
            className="hidden text-sm text-body transition hover:text-heading sm:inline"
          >
            Pricing
          </a>
          <a
            href="/blog"
            className="hidden text-sm text-body transition hover:text-heading sm:inline"
          >
            Blog
          </a>
          <a
            href="/signin"
            className="hidden text-sm text-body transition hover:text-heading sm:inline"
          >
            Sign In
          </a>
          <a
            href="/#signup"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            Get Started
          </a>
        </nav>
      </div>
    </header>
  );
}
