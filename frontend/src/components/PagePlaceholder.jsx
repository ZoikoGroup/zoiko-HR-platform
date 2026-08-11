import PageHeader from "./PageHeader";

export default function PagePlaceholder({
  title,
  path,
  badge,
  description = "This is a placeholder page cloned from the Zoiko UI structure.",
}) {
  return (
    <div className="space-y-6 font-sans">
      <PageHeader title={title} description={description} />
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <p className="text-sm text-slate-600">Route: <span className="font-semibold text-slate-800">{path ?? "unknown"}</span></p>
        {badge ? <p className="mt-2 text-sm text-slate-600">Badge: <span className="font-semibold text-[#FF7A00]">{badge}</span></p> : null}
        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500">
          This page is ready to be wired to the FastAPI backend and expanded with actual data.
        </div>
      </div>
    </div>
  );
}
