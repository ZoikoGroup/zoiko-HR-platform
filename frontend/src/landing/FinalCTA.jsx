import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function FinalCTA() {
  const navigate = useNavigate();
  return (
    <section className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        <div className="rounded-3xl p-10 md:p-14 bg-gradient-to-br from-[#312E81] via-[#4338CA] to-[#3B82F6] text-center shadow-2xl">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight mb-4">
            Ready to run your business in one
            <br />
            connected platform?
          </h2>
          <p className="text-blue-200 max-w-xl mx-auto leading-relaxed mb-8 text-sm">
            Start with the product you need today. Expand into the full platform when you're
            ready.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap mb-4">
            <button onClick={() => navigate("/get-demo")} className="inline-flex items-center gap-2 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold px-6 py-3 rounded-full text-sm shadow-lg shadow-orange-500/30 transition-all duration-200 hover:scale-[1.03]">
              Get a Demo <ArrowRight size={16} />
            </button>
            <button onClick={() => navigate("/pricing")} className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-6 py-3 rounded-full text-sm transition-all duration-200">
              View Pricing
            </button>
            <button onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-6 py-3 rounded-full text-sm transition-all duration-200">
              Explore Products
            </button>
          </div>

          <p className="text-xs text-blue-300/80">
            No pressure, no lock-in. See Zoiko One mapped to your operations.
          </p>
        </div>
      </div>
    </section>
  );
}