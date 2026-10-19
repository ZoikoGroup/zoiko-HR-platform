import React from "react";
import { Shield, Laptop, BookOpen, Utensils, Send, Download, Mail, Eye } from "lucide-react";

type OfferData = {
  candidateName: string;
  candidateAddress?: string;
  candidateCity?: string;
  candidateCountry?: string;
  position: string;
  department?: string;
  employmentType: string;
  joiningDate?: string;
  remunerationType?: string;
  amount?: number | null;
  currency?: string;
  payPeriod?: string;
  equity?: number | null;
  workLocation?: string;
  entityName?: string;
  entityAddress?: string;
  entityCity?: string;
  entityRegion?: string;
  entityPostalCode?: string;
  entityCountry?: string;
  notes?: string;
  date?: string;
  companyName: string;
  companyAddress?: string;
  companyCity?: string;
  companyRegion?: string;
  companyPostalCode?: string;
  companyCountry?: string;
  companyWebsite?: string;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

const PERIOD_LABELS: Record<string, string> = {
  annual: "per annum",
  monthly: "per month",
  hourly: "per hour",
  weekly: "per week",
};

const formatMoney = (amount: number | null, currency: string) => {
  if (amount == null) return "Not specified";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const periodSuffix = (period: string) => PERIOD_LABELS[period] || period;

export const OfferLetterTemplate = ({
  candidateName,
  candidateAddress = "",
  candidateCity = "",
  candidateCountry = "",
  position,
  department = "Engineering",
  employmentType = "full_time",
  joiningDate = "",
  remunerationType = "salary",
  amount = null,
  currency = "USD",
  payPeriod = "annual",
  equity = null,
  workLocation = "",
  entityName = "",
  entityAddress = "",
  entityCity = "",
  entityRegion = "",
  entityPostalCode = "",
  entityCountry = "",
  notes = "",
  date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  companyName = "Zoiko Industries Private Limited",
  companyAddress = "Prestige Tech Park, Tower 3",
  companyCity = "Bangalore",
  companyRegion = "Karnataka",
  companyPostalCode = "560103",
  companyCountry = "India",
  companyWebsite = "www.zoiko.com",
}: OfferData) => {
  const employmentLabel = EMPLOYMENT_LABELS[employmentType] || employmentType;
  const remunerationDisplay = formatMoney(amount, currency);
  const equityDisplay = equity != null ? `${equity}%` : "—";
  const typeLabel = remunerationType === "stipend" ? "Stipend" : remunerationType.charAt(0).toUpperCase() + remunerationType.slice(1);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-[850px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden p-8 sm:p-12 text-slate-800">
        {/* Header Section */}
        <div className="flex justify-between items-start border-b border-blue-600 pb-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
              <div className="w-6 h-6 border-2 border-white transform rotate-45 border-r-transparent"></div>
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {companyName} <span className="text-blue-600 font-normal">Industries</span>
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 leading-relaxed font-medium">
            <p className="font-semibold text-slate-700">{companyName}</p>
            <p>{companyAddress}</p>
            <p>{companyCity}, {companyRegion} - {companyPostalCode}</p>
            <p>{companyCountry} | {companyWebsite}</p>
          </div>
        </div>

        {/* Date */}
        <div className="mb-6 text-sm font-medium text-slate-700">{date}</div>

        {/* Candidate Address Block */}
        <div className="mb-6 text-sm leading-relaxed text-slate-700">
          <p className="font-bold text-slate-900">{candidateName}</p>
          {candidateAddress && <p>{candidateAddress}</p>}
          <p>{candidateCity}, {candidateCountry}</p>
        </div>

        {/* Salutation */}
        <div className="mb-4 text-sm font-semibold text-slate-900">
          Dear {candidateName.split(" ")[0]},
        </div>

        {/* Opening Paragraph */}
        <p className="text-sm text-slate-700 leading-relaxed mb-6">
          We are pleased to offer you the position of <strong className="text-slate-900">{position}</strong> at <strong className="text-slate-900">{companyName}</strong>. We believe your skills and potential will be an excellent fit for our team, and we are excited about the possibility of you joining us.
        </p>

        {/* Position Details Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-8 text-sm">
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Position</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{position}</div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-200">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Department</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{department}</div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Employment Type</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{employmentLabel}</div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-200">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Start Date</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{joiningDate || "—"}</div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Base {typeLabel}</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{remunerationDisplay} {periodSuffix(payPeriod)}</div>
          </div>
          {employmentType !== "internship" && (
            <div className="grid grid-cols-3 border-b border-slate-200">
              <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Annual Value</div>
              <div className="col-span-2 p-3 font-medium text-slate-900">{amount != null ? formatMoney(amount * 12, currency) : "—"}</div>
            </div>
          )}
          <div className="grid grid-cols-3 bg-slate-50/70">
            <div className="p-3 font-semibold text-slate-600 border-r border-slate-200">Work Location</div>
            <div className="col-span-2 p-3 font-medium text-slate-900">{workLocation || companyCity + ", " + companyRegion}</div>
          </div>
        </div>

        {/* Benefits & Perks Header */}
        <h3 className="text-sm font-bold text-slate-900 mb-3">Benefits & Perks</h3>

        {/* Benefits Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Health Insurance</p>
              <p className="text-[11px] text-slate-500">Group medical cover</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Work From Home</p>
              <p className="text-[11px] text-slate-500">Flexible policy</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Learning & Dev</p>
              <p className="text-[11px] text-slate-500">Access to Zoiko Learn</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Meal Allowance</p>
              <p className="text-[11px] text-slate-500">₹2,000 per month</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div className="mb-6 p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
            <p className="font-semibold text-slate-900 mb-1">Additional Notes</p>
            <p>{notes}</p>
          </div>
        )}

        {/* Closing Notes */}
        <p className="text-xs text-slate-600 leading-relaxed mb-4">
          This offer is subject to the terms and conditions outlined in the attached Annexures. Please confirm your acceptance by{" "}
          <strong className="text-slate-800">
            {joiningDate ? new Date(joiningDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "30 October 2026"}
          </strong>.
        </p>

        <p className="text-xs text-slate-700 font-medium mb-10">
          We look forward to welcoming you to {companyName}!
        </p>

        {/* Signatures Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 pt-4 border-t border-slate-200">
          <div>
            <p className="text-xs text-slate-600 mb-6 font-medium">Sincerely,</p>
            <div className="font-serif italic text-xl text-slate-800 mb-2 tracking-wide select-none">HR Team</div>
            <div className="border-t border-slate-300 pt-2">
              <p className="text-xs font-bold text-slate-900">HR Team</p>
              <p className="text-xs text-slate-500">Hiring Manager</p>
              <p className="text-xs text-slate-500">{companyName}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900 mb-12">Accepted and Agreed</p>
            <div className="border-t border-slate-300 pt-2 mb-4">
              <p className="text-xs font-bold text-slate-900">{candidateName}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">Date:</span>
              <div className="border-b border-slate-300 w-36 h-4"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar (Preview/Dropdown only) */}
      <div className="fixed bottom-6 right-6 flex gap-2 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-lg"
        >
          <Eye className="w-4 h-4" /> Print / Preview
        </button>
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium"
          disabled
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium"
          disabled
        >
          <Mail className="w-4 h-4" /> Send Email
        </button>
      </div>
    </div>
  );
};