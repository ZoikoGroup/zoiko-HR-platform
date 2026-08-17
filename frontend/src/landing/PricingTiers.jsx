import { ArrowRight, Check } from "lucide-react";

const tiers = [
  {
    title: "Standalone",
    desc: "Start with the one product you need today.",
    price: "$9",
    priceNote: "/ user / mo",
    sub: "Per product · billed annually",
    bullets: [
      "Any single Zoiko One product",
      "Core workflow & approvals",
      "Standard integrations",
      "Email & help center support",
    ],
    cta: "View Standalone Pricing",
    variant: "outline",
  },
  {
    title: "Bundles",
    desc: "Connected workflows across multiple products.",
    price: "$29",
    priceNote: "/ user / mo",
    sub: "People · Revenue · Control · Business",
    bullets: [
      "Multiple connected products",
      "Zoiko Hub & cross-product visibility",
      "Advanced approvals & automation",
      "Priority support",
      "Best value per product",
    ],
    cta: "Compare Bundles",
    variant: "accent",
    popular: false,
  },
  {
    title: "Enterprise",
    desc: "Global deployment, security & procurement support.",
    price: "Custom",
    priceNote: "",
    sub: "Multi-entity · regulated · global",
    bullets: [
      "Full platform + advanced permissions",
      "ZoikoPay & ZoikoCoreX",
      "SSO, audit, data residency",
      "Implementation & SLAs",
      "Dedicated customer success",
    ],
    cta: "Contact Sales",
    variant: "dark",
  },
];

export default function PricingTiers() {
  return (
    <section className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-[#3B82F6] tracking-[0.15em] uppercase mb-4">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
            Start with what you need.
            <br />
            Expand when you're ready.
          </h2>
          <p className="text-[#6B7280] max-w-xl mx-auto leading-relaxed">
            Three clear routes — buy one product, connect a bundle, or scale to enterprise. No
            one is forced into a single package.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.title}
              className={`relative rounded-2xl p-7 bg-white shadow-sm border border-gray-100 transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:border-[#3B82F6]`}
            >
              {t.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#3B82F6] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most Popular
                </span>
              )}

              <h3 className="text-lg font-bold text-[#111827] mb-1">{t.title}</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed mb-5">{t.desc}</p>

              <div className="mb-1">
                <span className="text-3xl font-extrabold text-[#0A1128]">{t.price}</span>
                {t.priceNote && (
                  <span className="text-sm text-[#9CA3AF] ml-1">{t.priceNote}</span>
                )}
              </div>
              <p className="text-xs text-[#9CA3AF] mb-5">{t.sub}</p>

              <ul className="flex flex-col gap-2.5 mb-6">
                {t.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <Check size={14} className="text-[#3B82F6] mt-0.5 shrink-0" />
                    <span className="text-sm text-[#374151]">{b}</span>
                  </li>
                ))}
              </ul>

              {t.variant === "outline" && (
                <button className="w-full inline-flex items-center justify-center gap-2 bg-white text-[#374151] font-semibold px-5 py-3 rounded-full text-sm border border-gray-200 hover:border-[#0A1128] hover:text-[#0A1128] transition-all duration-200">
                  {t.cta}
                </button>
              )}
              {t.variant === "accent" && (
                <button className="w-full inline-flex items-center justify-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold px-5 py-3 rounded-full text-sm shadow-lg shadow-blue-200 transition-all duration-200">
                  {t.cta}
                </button>
              )}
              {t.variant === "dark" && (
                <button className="w-full inline-flex items-center justify-center gap-2 bg-[#0A1128] hover:bg-[#111A33] text-white font-bold px-5 py-3 rounded-full text-sm transition-all duration-200">
                  {t.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}