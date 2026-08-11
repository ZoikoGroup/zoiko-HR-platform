import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  Plus, 
  AlertCircle, 
  ChevronRight,
  MoreVertical,
  Briefcase
} from 'lucide-react';

export default function MyLeaveDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');

  // Sample data based on your screenshot
  const leaveRequests = [
    {
      id: 'LR-2026-001',
      type: 'Casual Leave',
      startDate: 'Aug 12, 2026',
      endDate: 'Aug 13, 2026',
      days: 2,
      status: 'Pending',
      appliedOn: 'Aug 10, 2026'
    }
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 p-6 sm:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* TOP HEADER SECTION */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#1E293B] via-[#172033] to-[#0F172A] border border-slate-800 rounded-2xl px-6 sm:px-8 py-6 shadow-xl">
          {/* Orange Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-transparent"></div>
          <div className="absolute -right-16 -top-16 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400 mb-1">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse"></span>
                Zoiko HR Portal
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                My Leave <span className="text-orange-500">Overview</span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                View your real-time leave balances, active requests, and complete history.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/employee/leaves/apply')}
                className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-200 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Apply for Leave
              </button>
            </div>
          </div>
        </div>

        {/* LEAVE BALANCE METRICS / EMPTY STATE BANNER */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Main Informational / Empty Balance Box */}
          <div className="md:col-span-2 relative overflow-hidden bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col sm:flex-row items-center gap-6 shadow-xl">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-orange-400 shrink-0">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h3 className="text-lg font-bold text-white">No Leave Balances Configured</h3>
                <span className="text-[10px] bg-orange-500/10 text-orange-400 font-semibold px-2 py-0.5 rounded-full border border-orange-500/20">
                  Setup Needed
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your leave allocation has not been initialized yet. Please reach out to your HR administrator to set up your annual leave quota.
              </p>
              <button className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors pt-2 inline-flex items-center gap-1">
                Contact HR Department <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Pending Applications Stat */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-orange-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending Requests</span>
              <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-white">{leaveRequests.filter(r => r.status === 'Pending').length}</div>
              <div className="text-xs text-slate-400 mt-1">Awaiting manager approval</div>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 h-full w-1/3 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* LEAVE HISTORY SECTION */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-5">
            <div>
              <h2 className="text-xl font-bold text-white">Leave History</h2>
              <p className="text-xs text-slate-400 mt-0.5">Track previous requests and live status</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              {['all', 'pending', 'approved', 'rejected'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    activeTab === tab
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* History List */}
          <div className="space-y-3">
            {leaveRequests
              .filter((r) => activeTab === 'all' || r.status.toLowerCase() === activeTab)
              .map((request) => (
              <div
                key={request.id}
                className="group relative bg-slate-950/40 hover:bg-slate-800/40 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Accent Border on Hover */}
                <div className="absolute left-0 top-3 bottom-3 w-1 bg-orange-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="flex items-start md:items-center gap-4 pl-2">
                  <div className="p-3 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-300">
                    <Briefcase className="w-5 h-5 text-orange-400" />
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-white text-base capitalize">{request.type}</h4>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                        {request.id}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-1.5">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-orange-400" />
                        {request.startDate} &rarr; {request.endDate}
                      </span>
                      <span>•</span>
                      <span className="bg-slate-800/50 px-2 py-0.5 rounded text-slate-300">
                        {request.days} day(s)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side status and action */}
                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-slate-800/60 pt-3 md:pt-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    {request.status}
                  </span>

                  <button className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}
