import Header from "@/components/Header";
import Hero from "@/components/Hero";
import GetStarted from "@/components/GetStarted";
import Features from "@/components/Features";
import Testimonials from "@/components/Testimonials";
import About from "@/components/About";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import CustomSolutions from "@/components/CustomSolutions";
import FAQ from "@/components/FAQ";
import SignupForm from "@/components/SignupForm";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <GetStarted />
        <Features />
        <Testimonials />
        <About />
        <HowItWorks />
        <Pricing />
        <CustomSolutions />
        <FAQ />
        <SignupForm />
      </main>
      <Footer />
    </>
  );
}
