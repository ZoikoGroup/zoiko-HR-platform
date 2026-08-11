import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PRODUCTS } from "../../config/roles";
import { GUIDANCE_STEPS, GUIDANCE_META, SAMPLE_DISCLAIMER } from "./payrollGuidanceContent";
import {
  Sparkles, Building2, SlidersHorizontal, Globe, ShieldCheck, Layers, ClipboardList, Users,
  CalendarCheck, Plane, PlayCircle, CheckCircle2, FileText, BarChart3, Mail, Award,
  AlertTriangle, HelpCircle, Wrench, PartyPopper, Search, ChevronDown, ChevronRight,
  Menu, X, Printer, Copy, Check, ArrowLeft, ArrowRight, Info, Lightbulb, ShieldAlert,
  ListChecks, BookOpen, Home,
} from "lucide-react";

// ── Payroll module palette (matches Compliance/PayRollRuns/Reports styling) ──
const BRAND = "#19C58A";
const DARK = "#1A1816";
const MUTED = "#9E9690";
const BORDER = "#E5E0D9";
const BLUE = "#35B6F5";
const AMBER = "#F8A60A";
const PURPLE = "#9D7BF2";
const ROSE = "#FF6E86";

const STEP_ICONS = {
  Sparkles, Building2, SlidersHorizontal, Globe, ShieldCheck, Layers, ClipboardList, Users,
  CalendarCheck, Plane, PlayCircle, CheckCircle2, FileText, BarChart3, Mail, Award,
  AlertTriangle, HelpCircle, Wrench, PartyPopper,
};

const TONE_STYLES = {
  info: { Icon: Info, color: BLUE, bg: `${BLUE}0D`, border: `${BLUE}26` },
  tip: { Icon: Lightbulb, color: BRAND, bg: `${BRAND}0D`, border: `${BRAND}26` },
  warning: { Icon: AlertTriangle, color: AMBER, bg: `${AMBER}0D`, border: `${AMBER}26` },
  danger: { Icon: ShieldAlert, color: ROSE, bg: `${ROSE}0D`, border: `${ROSE}26` },
  success: { Icon: CheckCircle2, color: BRAND, bg: `${BRAND}0D`, border: `${BRAND}26` },
};

function matchesQuery(step, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (step.title.toLowerCase().includes(q) || step.summary.toLowerCase().includes(q)) return true;
  return step.content.some((block) => {
    if (block.text && block.text.toLowerCase().includes(q)) return true;
    if (block.title && block.title.toLowerCase().includes(q)) return true;
    if (Array.isArray(block.items)) {
      return block.items.some((item) => {
        if (typeof item === "string") return item.toLowerCase().includes(q);
        if (item?.q || item?.a) return `${item.q} ${item.a}`.toLowerCase().includes(q);
        if (item?.issue) return `${item.issue} ${item.cause} ${item.solution}`.toLowerCase().includes(q);
        return false;
      });
    }
    return false;
  });
}

function Callout({ tone = "info", title, text }) {
  const s = TONE_STYLES[tone] || TONE_STYLES.info;
  return (
    <div className="rounded-[14px] border p-4 flex gap-3" style={{ background: s.bg, borderColor: s.border }}>
      <s.Icon className="w-[18px] h-[18px] flex-shrink-0 mt-0.5" style={{ color: s.color }} strokeWidth={2.25} />
      <div>
        {title ? <p className="text-[13px] font-bold mb-0.5" style={{ color: s.color }}>{title}</p> : null}
        <p className="text-[13px] leading-relaxed text-[#4A453F] dark:text-[#C9C2B8]">{text}</p>
      </div>
    </div>
  );
}

function FlowDiagram({ title, steps }) {
  return (
    <div>
      {title ? <p className="text-[12px] font-bold uppercase tracking-[0.05em] mb-3" style={{ color: MUTED }}>{title}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <span
              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold border"
              style={{ borderColor: `${BRAND}33`, background: `${BRAND}0D`, color: DARK }}
            >
              {s}
            </span>
            {i < steps.length - 1 ? <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: MUTED }} /> : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function DataTable({ title, headers, rows }) {
  return (
    <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: BORDER }}>
      {title ? (
        <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: BORDER, background: "#FAF8F5" }}>
          <span className="text-[12px] font-bold" style={{ color: DARK }}>{title}</span>
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${AMBER}1A`, color: AMBER }}>Sample Data</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-2 font-bold" style={{ color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2" style={{ color: DARK, borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none" }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChecklistBlock({ title, items }) {
  const [checked, setChecked] = useState(() => new Set());
  const toggle = (i) => setChecked((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  return (
    <div className="rounded-[14px] border p-4" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12.5px] font-bold flex items-center gap-1.5" style={{ color: DARK }}>
          <ListChecks className="w-4 h-4" style={{ color: BRAND }} /> {title}
        </p>
        <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{checked.size}/{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <button
            type="button"
            key={i}
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-[8px] hover:bg-[#F6F4F0] dark:hover:bg-[#2A2520] transition-colors"
          >
            <span
              className="w-[16px] h-[16px] rounded-[5px] border flex items-center justify-center flex-shrink-0"
              style={{ borderColor: checked.has(i) ? BRAND : BORDER, background: checked.has(i) ? BRAND : "transparent" }}
            >
              {checked.has(i) ? <Check className="w-[11px] h-[11px] text-white" strokeWidth={3} /> : null}
            </span>
            <span className="text-[12.5px]" style={{ color: checked.has(i) ? MUTED : DARK, textDecoration: checked.has(i) ? "line-through" : "none" }}>
              {item}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FaqBlock({ items }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (i) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  return (
    <div className="space-y-2">
      {items.map((f, i) => {
        const isOpen = open.has(i);
        return (
          <div key={i} className="rounded-[12px] border overflow-hidden" style={{ borderColor: BORDER }}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-[13px] font-semibold" style={{ color: DARK }}>{f.q}</span>
              <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: MUTED, transform: isOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {isOpen ? (
              <div className="px-4 pb-3 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>{f.a}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TroubleBlock({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((t, i) => (
        <div key={i} className="rounded-[14px] border p-4" style={{ borderColor: BORDER }}>
          <p className="text-[13px] font-bold mb-2 flex items-center gap-1.5" style={{ color: ROSE }}>
            <AlertTriangle className="w-3.5 h-3.5" /> {t.issue}
          </p>
          <p className="text-[12px] mb-1.5"><span className="font-semibold" style={{ color: DARK }}>Likely cause: </span><span style={{ color: MUTED }}>{t.cause}</span></p>
          <p className="text-[12px]"><span className="font-semibold" style={{ color: DARK }}>Fix: </span><span style={{ color: MUTED }}>{t.solution}</span></p>
        </div>
      ))}
    </div>
  );
}

function Block({ block }) {
  switch (block.type) {
    case "p":
      return <p className="text-[13.5px] leading-relaxed" style={{ color: "#4A453F" }}>{block.text}</p>;
    case "h":
      return <h4 className="text-[13.5px] font-bold mt-2" style={{ color: DARK }}>{block.text}</h4>;
    case "list":
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-[13.5px] leading-relaxed flex gap-2" style={{ color: "#4A453F" }}>
              <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "callout":
      return <Callout tone={block.tone} title={block.title} text={block.text} />;
    case "flow":
      return <FlowDiagram title={block.title} steps={block.steps} />;
    case "table":
      return <DataTable title={block.title} headers={block.headers} rows={block.rows} />;
    case "checklist":
      return <ChecklistBlock title={block.title} items={block.items} />;
    case "faq":
      return <FaqBlock items={block.items} />;
    case "trouble":
      return <TroubleBlock items={block.items} />;
    default:
      return null;
  }
}

function StepSection({ step, index, total, isOpen, onToggle, onPrev, onNext, registerRef }) {
  const Icon = STEP_ICONS[step.icon] || BookOpen;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = step.content
      .map((b) => b.text || b.title || (Array.isArray(b.items) ? b.items.map((it) => (typeof it === "string" ? it : it.q || it.issue || "")).join("\n") : ""))
      .filter(Boolean)
      .join("\n");
    navigator.clipboard?.writeText(`${step.title}\n\n${text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [step]);

  return (
    <section
      id={step.id}
      ref={(el) => registerRef(step.id, el)}
      className="rounded-[18px] border bg-white dark:bg-[#221D1A] dark:border-[#38312D] shadow-[0_1px_3px_rgba(0,0,0,0.04)] scroll-mt-24"
      style={{ borderColor: BORDER }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-5 text-left"
      >
        <span
          className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
          style={{ background: `${BRAND}14`, color: BRAND }}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: MUTED }}>Step {step.number} of {total}</p>
          <h3 className="text-[16px] font-bold" style={{ color: DARK }}>{step.title}</h3>
        </div>
        <ChevronDown className="w-[18px] h-[18px] flex-shrink-0 transition-transform" style={{ color: MUTED, transform: isOpen ? "rotate(180deg)" : "none" }} />
      </button>

      {isOpen ? (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex justify-end no-print">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-[8px] border"
              style={{ borderColor: BORDER, color: copied ? BRAND : MUTED }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy section"}
            </button>
          </div>
          {step.content.map((block, i) => <Block key={i} block={block} />)}

          <div className="no-print flex items-center justify-between pt-3 border-t" style={{ borderColor: BORDER }}>
            <button
              type="button"
              disabled={index === 0}
              onClick={onPrev}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-[10px] border disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: BORDER, color: DARK }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={onNext}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-[10px] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: BRAND }}
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function PayrollGuidancePage() {
  const navigate = useNavigate();
  const { products, getFirstAccessibleRoute } = useAuth();

  // Defense-in-depth: PRODUCT_ALLOWED_PREFIXES already whitelists /organization-admin
  // for every product, so the route guard alone won't hide this page from a
  // non-Payroll org typing the URL directly — only the sidebar badge filter does.
  useEffect(() => {
    if (!products.includes(PRODUCTS.PAYROLL)) {
      navigate(getFirstAccessibleRoute(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [query, setQuery] = useState("");
  const [openSteps, setOpenSteps] = useState(() => new Set([GUIDANCE_STEPS[0].id]));
  const [activeId, setActiveId] = useState(GUIDANCE_STEPS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sectionRefs = useRef(new Map());

  const registerRef = useCallback((id, el) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const filteredSteps = useMemo(() => GUIDANCE_STEPS.filter((s) => matchesQuery(s, query)), [query]);
  const activeIndex = GUIDANCE_STEPS.findIndex((s) => s.id === activeId);

  const scrollToStep = useCallback((id, expand = true) => {
    if (expand) setOpenSteps((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      const el = sectionRefs.current.get(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setMobileNavOpen(false);
  }, []);

  const toggleStep = (id) => setOpenSteps((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const expandAll = () => setOpenSteps(new Set(GUIDANCE_STEPS.map((s) => s.id)));
  const collapseAll = () => setOpenSteps(new Set());

  const goPrev = (id) => {
    const i = GUIDANCE_STEPS.findIndex((s) => s.id === id);
    if (i > 0) scrollToStep(GUIDANCE_STEPS[i - 1].id);
  };
  const goNext = (id) => {
    const i = GUIDANCE_STEPS.findIndex((s) => s.id === id);
    if (i < GUIDANCE_STEPS.length - 1) scrollToStep(GUIDANCE_STEPS[i + 1].id);
  };

  const progressPct = Math.round(((Math.max(activeIndex, 0) + 1) / GUIDANCE_STEPS.length) * 100);

  const printCss = `
    @media print {
      .no-print { display: none !important; }
      body { background: #fff !important; }
      section { break-inside: avoid; }
    }
  `;

  if (!products.includes(PRODUCTS.PAYROLL)) return null;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)]" style={{ background: "#F8F7F4" }}>
      <style>{printCss}</style>

      {/* Breadcrumb */}
      <div className="no-print px-4 sm:px-6 lg:px-8 pt-4 flex items-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
        <Home className="w-3.5 h-3.5" />
        <span>Organization Admin</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-semibold" style={{ color: DARK }}>Payroll Guidance</span>
      </div>

      {/* Hero */}
      <div className="no-print px-4 sm:px-6 lg:px-8 pt-4">
        <div
          className="rounded-[20px] p-6 sm:p-8 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #0F9B6E)` }}
        >
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-white/15 px-2.5 py-1 rounded-full mb-3">
              <BookOpen className="w-3.5 h-3.5" /> Reference & Learning Guide
            </span>
            <h1 className="text-[24px] sm:text-[28px] font-bold tracking-[-0.01em]">{GUIDANCE_META.title}</h1>
            <p className="text-[13.5px] mt-2 text-white/85 leading-relaxed">{GUIDANCE_META.subtitle}</p>
            <p className="text-[11.5px] mt-3 text-white/70">{SAMPLE_DISCLAIMER}</p>
          </div>
          <div className="relative z-10 mt-5 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/70" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this guide…"
                className="w-full rounded-[12px] bg-white/15 placeholder-white/60 text-white text-[13px] pl-10 pr-4 py-2.5 outline-none focus:bg-white/20 transition-colors"
              />
            </div>
            {query ? (
              <p className="text-[11.5px] mt-1.5 text-white/70">{filteredSteps.length} of {GUIDANCE_STEPS.length} sections match</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sticky progress bar */}
      <div className="no-print sticky top-0 z-20 px-4 sm:px-6 lg:px-8 py-2.5 backdrop-blur-sm" style={{ background: "#F8F7F4EE", borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11.5px] font-semibold" style={{ color: DARK }}>
            Step {Math.max(activeIndex, 0) + 1} of {GUIDANCE_STEPS.length} — {GUIDANCE_STEPS[Math.max(activeIndex, 0)]?.title}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={expandAll} className="text-[11.5px] font-semibold px-2 py-1 rounded-[6px] hover:bg-[#EFEBE4]" style={{ color: MUTED }}>Expand All</button>
            <button onClick={collapseAll} className="text-[11.5px] font-semibold px-2 py-1 rounded-[6px] hover:bg-[#EFEBE4]" style={{ color: MUTED }}>Collapse All</button>
            <button onClick={() => window.print()} className="flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-[6px] hover:bg-[#EFEBE4]" style={{ color: MUTED }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={() => setMobileNavOpen((v) => !v)} className="lg:hidden flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-[6px] border" style={{ borderColor: BORDER, color: DARK }}>
              {mobileNavOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />} Contents
            </button>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EFEBE4" }}>
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: BRAND }} />
        </div>
      </div>

      {/* Mobile accordion nav */}
      {mobileNavOpen ? (
        <div className="no-print lg:hidden px-4 sm:px-6 py-3 space-y-1 border-b" style={{ borderColor: BORDER, background: "#fff" }}>
          {filteredSteps.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollToStep(s.id)}
              className="w-full text-left px-3 py-2 rounded-[8px] text-[13px] font-medium flex items-center gap-2"
              style={{ background: activeId === s.id ? `${BRAND}14` : "transparent", color: activeId === s.id ? BRAND : DARK }}
            >
              <span className="w-5 text-[11px] font-bold" style={{ color: MUTED }}>{s.number}</span>
              {s.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Desktop sticky TOC */}
        <aside className="no-print hidden lg:block">
          <div className="sticky top-[74px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-[16px] border bg-white p-3" style={{ borderColor: BORDER }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] px-2 mb-1" style={{ color: MUTED }}>Contents</p>
            <nav className="space-y-0.5">
              {filteredSteps.map((s) => {
                const Icon = STEP_ICONS[s.icon] || BookOpen;
                const isActive = activeId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollToStep(s.id)}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-[8px] text-[12.5px] font-medium transition-colors"
                    style={{ background: isActive ? `${BRAND}14` : "transparent", color: isActive ? BRAND : "#4A453F" }}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{s.number}. {s.title}</span>
                  </button>
                );
              })}
              {filteredSteps.length === 0 ? (
                <p className="text-[12px] px-2.5 py-2" style={{ color: MUTED }}>No sections match "{query}".</p>
              ) : null}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="space-y-3">
          {(query ? filteredSteps : GUIDANCE_STEPS).map((step, i) => (
            <StepSection
              key={step.id}
              step={step}
              index={GUIDANCE_STEPS.findIndex((s) => s.id === step.id)}
              total={GUIDANCE_STEPS.length}
              isOpen={openSteps.has(step.id)}
              onToggle={() => toggleStep(step.id)}
              onPrev={() => goPrev(step.id)}
              onNext={() => goNext(step.id)}
              registerRef={registerRef}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
