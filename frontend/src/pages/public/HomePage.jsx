import LandingHeader from "../../landing/LandingHeader";
import Hero from "../../landing/Hero";
import WhatItIs from "../../landing/WhatItIs";
import WhyExists from "../../landing/WhyExists";
import ProductGrid from "../../landing/ProductGrid";
import WhoItsFor from "../../landing/WhoItsFor";
import Philosophy from "../../landing/Philosophy";
import TrustCenter from "../../landing/TrustCenter";
import BusinessCloud from "../../landing/BusinessCloud";
import PricingTiers from "../../landing/PricingTiers";
import ComparisonTable from "../../landing/ComparisonTable";
import FAQ from "../../landing/FAQ";
import Footer from "../../landing/Footer";

export default function HomePage() {
  return (
    <div className="font-sans bg-white text-[#111827] min-h-screen">
      <LandingHeader />
      <main>
        <Hero />
        <WhatItIs />
        <WhyExists />
        <ProductGrid />
        <WhoItsFor />
        <Philosophy />
        <TrustCenter />
        <BusinessCloud />
        <PricingTiers />
        <ComparisonTable />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}