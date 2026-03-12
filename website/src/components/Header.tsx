export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-xl font-bold tracking-tight text-heading">
          swayat
        </a>
        <nav className="flex items-center gap-4">
          <a
            href="/account"
            className="text-sm text-body transition hover:text-heading"
          >
            Account
          </a>
          <a
            href="#signup"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            Get Started
          </a>
        </nav>
      </div>
    </header>
  );
}
