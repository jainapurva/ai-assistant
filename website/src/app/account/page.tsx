import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccountManager from "@/components/AccountManager";

export const metadata = {
  title: "Account — Swayat",
};

export default function AccountPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <AccountManager />
      </main>
      <Footer />
    </>
  );
}
