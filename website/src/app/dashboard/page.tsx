import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata = {
  title: "Agent Dashboard | Swayat AI",
  description: "View your real estate agent activity, leads, pipeline, and performance.",
};

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <Dashboard />
      </main>
      <Footer />
    </>
  );
}
