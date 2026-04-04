import { Logo } from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 sm:grid-cols-4">
          {/* Brand */}
          <div>
            <Logo iconSize={24} />
            <p className="mt-2 text-xs text-muted">
              AI-powered business tools for WhatsApp
            </p>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-sm font-semibold text-heading">Features</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><a href="/features/invoicing" className="transition hover:text-heading">Invoicing</a></li>
              <li><a href="/features/booking" className="transition hover:text-heading">Booking</a></li>
              <li><a href="/features/marketing" className="transition hover:text-heading">Marketing</a></li>
              <li><a href="/features/real-estate" className="transition hover:text-heading">Real Estate CRM</a></li>
              <li><a href="/features/customer-support" className="transition hover:text-heading">Customer Support</a></li>
              <li><a href="/features/whatsapp-crm" className="transition hover:text-heading">WhatsApp CRM</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-heading">Resources</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><a href="/blog" className="transition hover:text-heading">Blog</a></li>
              <li><a href="/compare/swayat-vs-wati" className="transition hover:text-heading">Swayat vs Wati</a></li>
              <li><a href="/compare/swayat-vs-interakt" className="transition hover:text-heading">Swayat vs Interakt</a></li>
              <li><a href="/compare/swayat-vs-aisensy" className="transition hover:text-heading">Swayat vs AiSensy</a></li>
              <li><a href="#pricing" className="transition hover:text-heading">Pricing</a></li>
              <li><a href="#faq" className="transition hover:text-heading">FAQ</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-heading">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><a href="/signin" className="transition hover:text-heading">Sign In</a></li>
              <li><a href="/privacy" className="transition hover:text-heading">Privacy Policy</a></li>
              <li><a href="/terms" className="transition hover:text-heading">Terms of Service</a></li>
              <li><a href="mailto:support@swayat.com" className="transition hover:text-primary">support@swayat.com</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 text-center">
          <span className="text-xs text-muted">
            &copy; {new Date().getFullYear()} Swayat AI. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
