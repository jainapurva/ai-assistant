export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-xl font-bold tracking-tight">
          read<span className="text-primary-light">with</span>me
        </a>
        <a
          href="#signup"
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold transition hover:bg-primary-dark"
        >
          Get Started
        </a>
      </div>
    </header>
  );
}
