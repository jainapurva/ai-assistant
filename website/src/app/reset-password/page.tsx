import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ResetPassword from "@/components/ResetPassword";

export const metadata = {
  title: "Reset Password | Swayat AI",
  description: "Set a new password for your Swayat AI account.",
};

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <ResetPassword />
      </main>
      <Footer />
    </>
  );
}
