import DraftTypes from '@/components/landing/DraftTypes';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import Navbar from '@/components/landing/Navbar';
import PainSolution from '@/components/landing/PainSolution';
import TrustBar from '@/components/landing/TrustBar';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <PainSolution />
      <DraftTypes />
      <HowItWorks />
      <TrustBar />
      <FinalCTA />
      <Footer />
    </>
  );
}
