// The frame every employee page sits in: a navy-to-blue gradient header (title, subtitle, page actions) over a soft page background.
// variant="plain" gives a slim white header for a page that carries its own banner (the dashboard).
export default function EmployeePageShell({ title, subtitle, actions, children, variant = "banner" }) {
  const plain = variant === "plain";
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
      {plain ? (
        <header className="bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-[#334155]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a3b8]">{subtitle}</p>}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </header>
      ) : (
        <header className="relative overflow-hidden bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white">
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
          <div className="absolute -right-10 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
          <div className="absolute top-0 right-1/3 w-48 h-48 rounded-full bg-indigo-500/10 blur-xl pointer-events-none" />
        </header>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
