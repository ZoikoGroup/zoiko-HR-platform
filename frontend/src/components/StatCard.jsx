import React from 'react';
import { TrendingUp } from 'lucide-react';

const colorMap = {
  teal:     { bg: 'bg-[#19C58A]/10',    icon: 'text-[#19C58A]' },
  green:    { bg: 'bg-[#19C58A]/10',    icon: 'text-[#19C58A]' },
  emerald:  { bg: 'bg-[#19C58A]/10',    icon: 'text-[#19C58A]' },
  payroll:  { bg: 'bg-[#19C58A]/10',    icon: 'text-[#19C58A]' },
  blue:     { bg: 'bg-[#35B6F5]/10',    icon: 'text-[#35B6F5]' },
  employee: { bg: 'bg-[#35B6F5]/10',    icon: 'text-[#35B6F5]' },
  orange:   { bg: 'bg-[#F8A60A]/10',    icon: 'text-[#F8A60A]' },
  amber:    { bg: 'bg-[#F8A60A]/10',    icon: 'text-[#F8A60A]' },
  tax:      { bg: 'bg-[#F8A60A]/10',    icon: 'text-[#F8A60A]' },
  purple:   { bg: 'bg-[#9D7BF2]/10',    icon: 'text-[#9D7BF2]' },
  finance:  { bg: 'bg-[#9D7BF2]/10',    icon: 'text-[#9D7BF2]' },
  rose:     { bg: 'bg-[#FF6E86]/10',    icon: 'text-[#FF6E86]' },
  pink:     { bg: 'bg-[#FF6E86]/10',    icon: 'text-[#FF6E86]' },
  alert:    { bg: 'bg-[#FF6E86]/10',    icon: 'text-[#FF6E86]' },
};

export default function StatCard({ icon: Icon, title, value, loading, color = 'teal', trend, suffix }) {
  const c = colorMap[color] || colorMap.teal;
  return (
    <div className="bg-white dark:bg-[#221D1A] border border-[#E5E0D9] dark:border-[#38312D] rounded-[18px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 flex items-start gap-4">
      <div className={`p-3 rounded-[14px] ${c.bg} flex items-center justify-center flex-shrink-0`}>
        {Icon && <Icon className={`w-5 h-5 ${c.icon}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#9E9690] mb-1 truncate">{title}</p>
        {loading ? (
          <div className="w-16 h-7 bg-[#E5E0D9] dark:bg-[#38312D] rounded-[10px] animate-pulse" />
        ) : (
          <p className="text-[26px] font-extrabold text-[#1A1816] dark:text-[#F0EDE8] leading-none">
            {value ?? '—'}
            {suffix && <span className="text-[14px] font-bold text-[#9E9690] ml-1">{suffix}</span>}
          </p>
        )}
        {trend && !loading && (
          <div className="flex items-center gap-1 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#19C58A]" />
            <span className="text-[11px] font-bold text-[#19C58A]">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}
