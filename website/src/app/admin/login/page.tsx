import type { Metadata } from "next";
import { LoginForm } from "../client";

export const metadata: Metadata = {
  title: "Admin — Swayat AI",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Swayat Admin</h1>
        <p className="mb-6 mt-1 text-sm text-ink/50">Sign in to view the dashboard</p>
        <LoginForm />
      </div>
    </main>
  );
}
