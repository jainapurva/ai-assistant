export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <span className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Read With Me. All rights reserved.
        </span>
        <div className="flex gap-6 text-sm text-gray-500">
          <a href="#features" className="transition hover:text-gray-300">
            Features
          </a>
          <a href="#how-it-works" className="transition hover:text-gray-300">
            How It Works
          </a>
          <a href="#signup" className="transition hover:text-gray-300">
            Sign Up
          </a>
        </div>
      </div>
    </footer>
  );
}
