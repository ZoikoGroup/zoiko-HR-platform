import { Check, X } from "lucide-react";
import { PLAN_MATRIX } from "../config/planMatrix";

function Cell({ value }) {
  if (value === true) {
    return <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><Check size={15} aria-hidden="true" /><span className="sr-only">Included</span></span>;
  }
  if (value === false) {
    return <span className="inline-flex items-center gap-1 text-gray-400"><X size={15} aria-hidden="true" /><span className="text-xs">Not included</span></span>;
  }
  return <span className="text-xs font-medium text-gray-700">{value}</span>;
}

/** Side-by-side Core vs Advanced. `highlight` ("core" | "advanced") tints the customer's own plan column. */
export default function PlanComparison({ highlight = null, compact = false }) {
  const tint = (code) => (highlight === code ? "bg-blue-50/60" : "");
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" data-testid="plan-comparison">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Feature</th>
            <th className={`px-4 py-3 font-semibold ${tint("core")}`}>Core{highlight === "core" ? " (your plan)" : ""}</th>
            <th className={`px-4 py-3 font-semibold ${tint("advanced")}`}>Advanced{highlight === "advanced" ? " (your plan)" : ""}</th>
          </tr>
        </thead>
        {PLAN_MATRIX.map((group) => (
          <tbody key={group.section} className="divide-y divide-gray-100">
            <tr><th colSpan={3} scope="colgroup" className="bg-gray-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-600">{group.section}</th></tr>
            {group.rows.map((row) => (
              <tr key={row.feature}>
                <td className={`${compact ? "py-1.5" : "py-2.5"} px-4 text-gray-800`}>{row.feature}</td>
                <td className={`${compact ? "py-1.5" : "py-2.5"} px-4 ${tint("core")}`}><Cell value={row.core} /></td>
                <td className={`${compact ? "py-1.5" : "py-2.5"} px-4 ${tint("advanced")}`}><Cell value={row.advanced} /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
        Enterprise adds contract-grade security, identity provisioning, sandbox environments and an SLA. It is priced by contract: contact sales.
      </p>
    </div>
  );
}
