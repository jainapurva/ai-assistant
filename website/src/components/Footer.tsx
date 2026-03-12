export default function Footer() {
  return (
    <footer className="border-t border-slate-200 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <span className="text-sm text-muted">
          &copy; {new Date().getFullYear()} Swayat. All rights reserved.
        </span>
        <div className="flex gap-6 text-sm text-muted">
          <a href="#features" className="transition hover:text-heading">
            Features
          </a>
          <a href="#how-it-works" className="transition hover:text-heading">
            How It Works
          </a>
          <a href="#signup" className="transition hover:text-heading">
            Sign Up
          </a>
          <a href="/account" className="transition hover:text-heading">
            Account
          </a>
          <a href="/privacy" className="transition hover:text-heading">
            Privacy Policy
          </a>
          <a href="/terms" className="transition hover:text-heading">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}
