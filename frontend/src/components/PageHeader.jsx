export default function PageHeader({ title, description, action, className = "" }) {
  return (
    <header className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm font-sans ${className}`.trim()}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-['Sora',system-ui,sans-serif] text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </header>
  );
}
