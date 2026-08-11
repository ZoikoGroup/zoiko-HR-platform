export default function EmployeePageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-[#0f172a]">
      <header className="bg-white dark:bg-[#1e293b] border-b border-[#E5E7EB] dark:border-[#334155]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold text-[#111827] dark:text-[#f1f5f9]">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-[#6B7280] dark:text-[#94a3b8]">{subtitle}</p>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
