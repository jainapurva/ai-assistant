import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SignIn from "@/components/SignIn";

export const metadata = {
  title: "Sign In | Swayat AI",
  description: "Sign in to your Swayat AI dashboard.",
};

export default function SignInPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <SignIn />
      </main>
      <Footer />
    </>
  );
}
