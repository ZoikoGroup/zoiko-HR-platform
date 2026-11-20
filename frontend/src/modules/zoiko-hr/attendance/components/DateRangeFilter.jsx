const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["this_week", "This week"], ["this_month", "This month"]];

/**
 * Date range: quick presets (computed by the server in the organization's time zone) or a custom From / To.
 * value = { preset } or { date_from, date_to }; onChange receives the next value.
 */
export default function DateRangeFilter({ value = {}, onChange }) {
  const custom = !value.preset;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        {PRESETS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value.preset === v} onClick={() => onChange({ preset: v })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${value.preset === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>
      <label className="text-xs text-slate-600">From
        <input type="date" aria-label="From date" value={custom ? value.date_from || "" : ""}
          onChange={(e) => onChange({ date_from: e.target.value, date_to: custom ? value.date_to || "" : "" })}
          className="ml-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">To
        <input type="date" aria-label="To date" value={custom ? value.date_to || "" : ""}
          onChange={(e) => onChange({ date_from: custom ? value.date_from || "" : "", date_to: e.target.value })}
          className="ml-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
      </label>
    </div>
  );
}
