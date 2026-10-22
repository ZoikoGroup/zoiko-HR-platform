/* HRPage Component */
import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardCheck, FileText, LayoutDashboard, Settings, UserPlus, Users } from 'lucide-react';

const ONBOARDING_NAV = [
  { label: 'Dashboard', href: '/zoiko-hr/onboarding', icon: LayoutDashboard },
  { label: 'New Hires', href: '/zoiko-hr/onboarding/new-hires', icon: Users },
  { label: 'Pre-Onboarding', href: '/zoiko-hr/onboarding/pre-onboarding', icon: UserPlus },
  { label: 'Documents', href: '/zoiko-hr/onboarding/documents', icon: FileText },
  { label: 'Checklists', href: '/zoiko-hr/onboarding/checklists', icon: ClipboardCheck },
  { label: 'Orientation', href: '/zoiko-hr/onboarding/orientation', icon: CalendarDays },
  { label: 'Reports', href: '/zoiko-hr/onboarding/reports', icon: BarChart3 },
  { label: 'Settings', href: '/zoiko-hr/onboarding/settings', icon: Settings },
];

export default function HRPage({ title, subtitle, children, actions }) {
  const isOnboarding = /onboarding|new hires|orientation sessions/i.test(title || '');
  if (isOnboarding) {
    const PageIcon = ONBOARDING_NAV.find((item) => item.label === title.replace(/^Onboarding\s+/i, '').replace(/^Orientation Sessions$/i, 'Orientation'))?.icon || Users;
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="relative overflow-hidden rounded-b-3xl bg-gradient-to-r from-[#0A1128] via-[#0E1734] to-[#111A33] text-white shadow-[0_10px_30px_rgba(4,7,20,0.25)] sm:rounded-3xl">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-400"><span>Zoiko HR</span><span aria-hidden="true">›</span><span>Onboarding</span><span aria-hidden="true">›</span><span className="font-medium text-slate-200">{title}</span></nav>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:grid" aria-hidden="true"><PageIcon className="h-6 w-6 text-blue-300" /></span>
                <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-white sm:text-[28px]">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}</div>
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            <nav aria-label="Onboarding sections" className="mt-6 flex gap-1 overflow-x-auto">
              {ONBOARDING_NAV.map((item) => { const Icon = item.icon; return <NavLink key={item.href} to={item.href} end={item.href === '/zoiko-hr/onboarding'} className={({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-slate-50 text-[#0A1128] shadow-[0_-2px_8px_rgba(0,0,0,0.08)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon className="h-4 w-4" aria-hidden="true" />{item.label}</NavLink>; })}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
              )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
