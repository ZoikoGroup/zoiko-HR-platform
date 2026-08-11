export default function PageHeader({ title, description, action }) {
  return (
    <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </header>
  );
}
