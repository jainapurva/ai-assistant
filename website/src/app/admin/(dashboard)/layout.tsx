import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, LogoutButton } from "../client";

export const metadata: Metadata = {
  title: "Admin — Swayat AI",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/funnel", label: "Funnel" },
  { href: "/admin/health", label: "Health" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <AutoRefresh seconds={60} />
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="font-semibold">
              Swayat <span className="text-primary">Admin</span>
            </Link>
            <nav className="flex gap-5 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-ink/60 transition hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-ink/40 sm:block">auto-refreshes every 60s</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
