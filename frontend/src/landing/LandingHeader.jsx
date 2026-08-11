import { useState, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

const NAVY = "#161B33";
const BODY = "#5B6373";
const LABEL_GRAY = "#8A93A3";

const dropdownStyles = `
  .dropdown-container {
    position: relative;
    display: inline-block;
  }

  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #2A2F55;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 2px;
    user-select: none;
    font-family: inherit;
  }
  .dropdown-trigger:hover { color: #4F46E5; }
  .dropdown-trigger .chevron {
    font-size: 11px;
    transition: transform 0.2s;
    display: inline-block;
  }
  .dropdown-trigger .chevron.open { transform: rotate(180deg); }

  .dropdown-panel {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.13), 0 1px 6px rgba(0,0,0,0.06);
    padding: 36px 24px 20px;
    width: 700px;
    z-index: 200;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .products-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0 20px;
  }

  .col { display: flex; flex-direction: column; gap: 0; }

  .section-label {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: #8888aa;
    margin-bottom: 10px;
    margin-top: 2px;
  }
  .section-label.mt { margin-top: 16px; }

  .product-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 6px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s;
    text-decoration: none;
    margin-bottom: 2px;
  }
  .product-item:hover { background: #f4f4fb; }

  .product-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .product-text { display: flex; flex-direction: column; padding-top: 1px; }
  .product-name {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a3e;
    line-height: 1.2;
    margin-bottom: 2px;
  }
  .product-desc {
    font-size: 12px;
    color: #888899;
    line-height: 1.4;
    font-weight: 400;
    white-space: pre-line;
  }

  .bg-purple      { background: #5b5bd6; }
  .bg-dark-purple { background: #2d2a6e; }
  .bg-orange      { background: #f97316; }
  .bg-blue-light  { background: #38bdf8; }
  .bg-navy        { background: #1a1a3e; }
  .bg-orange-mid  { background: #f59e0b; }
`;

const IconHR = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="7" r="3" fill="white" fillOpacity="0.9"/>
    <circle cx="16" cy="7" r="3" fill="white" fillOpacity="0.5"/>
    <path d="M2 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" fillOpacity="0.9"/>
    <path d="M16 13c2.5 0 5 1.5 5 5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" fillOpacity="0.5"/>
  </svg>
);

const IconTime = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M12 7v5l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconPayroll = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity="0.1"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Inter,sans-serif">$</text>
  </svg>
);

const IconBilling = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3" width="13" height="16" rx="2" fill="white" fillOpacity="0.85"/>
    <rect x="7" y="7" width="7" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="7" y="10" width="7" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="7" y="13" width="5" height="1.5" rx="0.75" fill="#f97316"/>
  </svg>
);

const IconSpend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M7 16l5-5 3 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 20h16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 10h3V7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconProjects = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="13" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.5"/>
    <rect x="3" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.5"/>
    <rect x="13" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.3"/>
  </svg>
);

const IconInventory = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="6" fill="white" fillOpacity="0.9"/>
    <circle cx="12" cy="12" r="2.5" fill="#5b5bd6"/>
  </svg>
);

const IconComply = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconInsights = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3"  y="14" width="4" height="6" rx="1" fill="white" fillOpacity="0.6"/>
    <rect x="10" y="9"  width="4" height="11" rx="1" fill="white" fillOpacity="0.85"/>
    <rect x="17" y="5"  width="4" height="15" rx="1" fill="white"/>
  </svg>
);

const IconDocs = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="11" height="14" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="8" y="7"  width="5" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="8" y="10" width="5" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="8" y="13" width="3" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="13" y="10" width="5" height="8" rx="1.5" fill="#f97316" fillOpacity="0.8"/>
  </svg>
);

const products = {
  people: [
    { name: "Zoiko HR",      desc: "Records,\nonboarding,\nlifecycle",    icon: <IconHR/>,      bg: "bg-purple", href: "/products/zoiko-hr" },
    { name: "ZoikoTime",     desc: "Time,\nattendance,\nschedules",       icon: <IconTime/>,    bg: "bg-purple", href: "/products/zoikotime" },
    { name: "Zoiko Payroll", desc: "Controlled pay runs",                  icon: <IconPayroll/>, bg: "bg-dark-purple", href: "/products/payroll" },
  ],
  money: [
    { name: "Zoiko Billing", desc: "Invoices,\nsubscriptions,\nrevenue",   icon: <IconBilling/>, bg: "bg-orange", href: "/products/billing" },
    { name: "Zoiko Spend",   desc: "Procurement,\nPOs, vendor AP",          icon: <IconSpend/>,   bg: "bg-orange", href: "/products/spend" },
  ],
  workSupply: [
    { name: "Zoiko Projects",   desc: "Delivery,\nbudgets, margin",         icon: <IconProjects/>,   bg: "bg-blue-light", href: "/projects" },
    { name: "Zoiko Inventory",  desc: "Stock, receiving,\nreorder",          icon: <IconInventory/>,  bg: "bg-purple", href: "/inventory" },
  ],
  control: [
    { name: "Zoiko Comply",   desc: "Obligations,\nevidence, audit",        icon: <IconComply/>,   bg: "bg-dark-purple", href: "/products/comply" },
    { name: "Zoiko Insights", desc: "Dashboards,\nrisk, forecasts",         icon: <IconInsights/>, bg: "bg-dark-purple", href: "/insights" },
  ],
  premium: [
    { name: "Zoiko Docs Pro", desc: "Jurisdiction-\naware documents",       icon: <IconDocs/>,    bg: "bg-orange", href: "/zoiko-docs" },
  ],
};

function ProductItem({ name, desc, icon, bg, href }) {
  return (
    <Link className="product-item" to={href}>
      <div className={`product-icon ${bg}`}>{icon}</div>
      <div className="product-text">
        <span className="product-name">{name}</span>
        <span className="product-desc">{desc}</span>
      </div>
    </Link>
  );
}

const navLinks = ["Home", "Platform", "Products", "Solutions", "Pricing", "Resources", "About"];

export default function LandingHeader() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  return (
    <>
      <style>{dropdownStyles}</style>
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[#F1EEFC] to-white border-b border-[#E2E4EF] rounded-b-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <a href="https://zoikoone.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 shrink-0 no-underline">
            <img src={logo} alt="Zoiko One" style={{ height: "36px", width: "auto", objectFit: "contain" }} />
          </a>

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[#2A2F55] overflow-visible">
            {navLinks.map((l) => {
              if (l === "Home") {
                return <Link key={l} to="/" className="hover:text-[#4F46E5] transition-colors no-underline">{l}</Link>;
              }
              if (l === "Products") {
                return (
                  <div key={l} className="dropdown-container" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
                    <button className="dropdown-trigger">
                      Products
                      <span className={`chevron${open ? " open" : ""}`}>&#8964;</span>
                    </button>

                    {open && (
                      <div className="dropdown-panel">
                        <div className="products-grid">
                          <div className="col">
                            <div className="section-label">People</div>
                            {products.people.map((p) => <ProductItem key={p.name} {...p} />)}
                          </div>

                          <div className="col">
                            <div className="section-label">Money</div>
                            {products.money.map((p) => <ProductItem key={p.name} {...p} />)}
                            <div className="section-label mt">Work + Supply</div>
                            {products.workSupply.map((p) => <ProductItem key={p.name} {...p} />)}
                          </div>

                          <div className="col">
                            <div className="section-label">Control</div>
                            {products.control.map((p) => <ProductItem key={p.name} {...p} />)}
                            <div className="section-label mt">Premium Capability</div>
                            {products.premium.map((p) => <ProductItem key={p.name} {...p} />)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              if (l === "Solutions") {
                return <Link key={l} to="/solutions" className="hover:text-[#4F46E5] transition-colors no-underline">{l}</Link>;
              }
              if (l === "Pricing") {
                return <Link key={l} to="/pricing" className="hover:text-[#4F46E5] transition-colors no-underline">{l}</Link>;
              }
              if (l === "Resources") {
                return <Link key={l} to="/resources" className="hover:text-[#4F46E5] transition-colors no-underline">{l}</Link>;
              }
              if (l === "About") {
                return <Link key={l} to="/about" className="hover:text-[#4F46E5] transition-colors no-underline">{l}</Link>;
              }
              return (
                <a key={l} href={l === "Platform" ? "/platform" : "/"} className="hover:text-[#4F46E5] transition-colors">
                  {l}
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link to="/login" className="text-[#1E1B4B] no-underline">
              Sign In
            </Link>
            <button onClick={() => navigate("/get-demo")} className="inline-flex items-center gap-1 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-full px-5 py-2.5 shadow-md shadow-orange-200 transition-all duration-200">
              Get a Demo <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
