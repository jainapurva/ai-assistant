import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ForgotPassword from "@/components/ForgotPassword";

export const metadata = {
  title: "Forgot Password | Swayat AI",
  description: "Reset your Swayat AI account password.",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <ForgotPassword />
      </main>
      <Footer />
    </>
  );
}
