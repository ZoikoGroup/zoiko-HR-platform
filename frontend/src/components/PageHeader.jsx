export default function PageHeader({ title, description, action }) {
  return (
    <header className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.06)] font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">{title}</h1>
          {description ? <p className="mt-2 text-sm text-[#334155]">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </header>
  );
}