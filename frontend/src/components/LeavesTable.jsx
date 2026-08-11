import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, User } from "lucide-react";

const LEAVE_BADGE = {
  utilized: "bg-[#F8A60A]/10 text-[#F8A60A]",
  available: "bg-[#19C58A]/10 text-[#19C58A]",
  month: "bg-[#35B6F5]/10 text-[#35B6F5]",
};

function SortIcon({ col, sortKey, sortOrder }) {
  if (sortKey !== col) return <ChevronsUpDown size={13} className="text-[#9E9690] ml-1 inline" />;
  return sortOrder === "asc"
    ? <ChevronUp size={13} className="text-[#19C58A] ml-1 inline" />
    : <ChevronDown size={13} className="text-[#19C58A] ml-1 inline" />;
}

function InitialsAvatar({ name }) {
  const parts = (name || "").trim().split(" ");
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : (parts[0]?.[0] || "?");

  const colors = [
    "bg-[#19C58A]", "bg-[#35B6F5]", "bg-[#9D7BF2]",
    "bg-[#FF6E86]", "bg-[#F8A60A]", "bg-[#06B6D4]",
  ];
  const idx = (name || "").charCodeAt(0) % colors.length;

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${colors[idx]}`}>
      {initials.toUpperCase()}
    </div>
  );
}

function Badge({ label, variant }) {
  const cls = LEAVE_BADGE[variant] || "bg-[#F0EDE8] dark:bg-[#38312D] text-[#9E9690]";
  return (
    <span className={`inline-flex items-center justify-center min-w-[32px] px-2.5 py-1 rounded-full text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

export default function LeavesTable({
  allocations = [],
  monthLeaveCounts = {},
  getAvailableLeaves,
  getUtilizedLeaves,
}) {
  const [sortKey, setSortKey] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  function toggleSort(key) {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...allocations].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case "name":       av = a.name || "";                   bv = b.name || "";                   break;
        case "department": av = a.department || "";             bv = b.department || "";             break;
        case "utilized":   av = getUtilizedLeaves(a);           bv = getUtilizedLeaves(b);           break;
        case "available":  av = getAvailableLeaves(a);          bv = getAvailableLeaves(b);          break;
        case "thisMonth":  av = monthLeaveCounts[a.employeeId] || 0; bv = monthLeaveCounts[b.employeeId] || 0; break;
        default:           av = a.name || "";                   bv = b.name || "";
      }
      if (typeof av === "string") {
        const cmp = av.localeCompare(bv);
        return sortOrder === "asc" ? cmp : -cmp;
      }
      return sortOrder === "asc" ? av - bv : bv - av;
    });
  }, [allocations, sortKey, sortOrder, getAvailableLeaves, getUtilizedLeaves, monthLeaveCounts]);

  const thCls = "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#9E9690] select-none whitespace-nowrap";
  const thCenterCls = "px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#9E9690] select-none whitespace-nowrap";

  return (
    <div className="bg-white dark:bg-[#221D1A] border border-[#E5E0D9] dark:border-[#38312D] rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed">
          <thead>
            <tr className="bg-[#F8F7F4] dark:bg-[#2A2520] border-b border-[#E5E0D9] dark:border-[#38312D]">
              <th
                className={`${thCls} w-64 cursor-pointer hover:bg-[#F0EDE8] dark:hover:bg-[#38312D] transition-all duration-150`}
                onClick={() => toggleSort("name")}
              >
                Employee <SortIcon col="name" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th
                className={`${thCls} cursor-pointer hover:bg-[#F0EDE8] dark:hover:bg-[#38312D] transition-all duration-150`}
                onClick={() => toggleSort("department")}
              >
                Department <SortIcon col="department" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th
                className={`${thCenterCls} cursor-pointer hover:bg-[#F0EDE8] dark:hover:bg-[#38312D] transition-all duration-150`}
                onClick={() => toggleSort("utilized")}
              >
                Utilized <SortIcon col="utilized" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th
                className={`${thCenterCls} cursor-pointer hover:bg-[#F0EDE8] dark:hover:bg-[#38312D] transition-all duration-150`}
                onClick={() => toggleSort("available")}
              >
                Available <SortIcon col="available" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th
                className={`${thCenterCls} cursor-pointer hover:bg-[#F0EDE8] dark:hover:bg-[#38312D] transition-all duration-150`}
                onClick={() => toggleSort("thisMonth")}
              >
                This Month <SortIcon col="thisMonth" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EDE8] dark:divide-[#38312D]/50">
            {sorted.map((a, idx) => {
              const utilized = getUtilizedLeaves(a);
              const available = getAvailableLeaves(a);
              const thisMonth = monthLeaveCounts[a.employeeId] || 0;
              return (
                <tr
                  key={a.employeeId}
                  className={`transition-all duration-150 hover:bg-[#F8F7F4] dark:hover:bg-[#2A2520] ${idx % 2 === 0 ? "bg-white dark:bg-[#221D1A]" : "bg-[#F8F7F4]/50 dark:bg-[#2A2520]/50"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={a.name} />
                      <div>
                        <p className="text-[13px] font-semibold text-[#1A1816] dark:text-[#F0EDE8] leading-tight">{a.name || "—"}</p>
                        <p className="text-[11px] text-[#9E9690]">ID #{a.employeeId}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {a.department ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-[8px] bg-[#35B6F5]/10 text-[#35B6F5] text-[11px] font-semibold">
                        {a.department}
                      </span>
                    ) : (
                      <span className="text-[#9E9690] text-[11px]">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <Badge label={utilized} variant="utilized" />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <Badge label={available} variant="available" />
                  </td>

                  <td className="px-4 py-3 text-center">
                    {thisMonth > 0 ? (
                      <Badge label={thisMonth} variant="month" />
                    ) : (
                      <span className="text-[#9E9690] text-[13px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-[#F8F7F4] dark:bg-[#2A2520] border-t border-[#E5E0D9] dark:border-[#38312D] px-4 py-2.5 flex items-center justify-between">
        <p className="text-[11px] text-[#9E9690]">
          Showing <span className="font-semibold text-[#1A1816] dark:text-[#F0EDE8]">{sorted.length}</span> employee{sorted.length !== 1 ? "s" : ""}
        </p>
        <p className="text-[11px] text-[#9E9690]">
          Click column headers to sort
        </p>
      </div>
    </div>
  );
}
