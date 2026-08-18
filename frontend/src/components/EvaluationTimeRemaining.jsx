import { useMemo } from "react";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

const DEFAULT_EVALUATION_DAYS = 14;

function calcRemaining(evaluationEndsAt) {
  if (!evaluationEndsAt) return null;
  const end = new Date(evaluationEndsAt);
  const now = new Date();
  const diffMs = end - now;
  if (diffMs <= 0) return { days: 0, hours: 0, totalHours: 0, percent: 0, expired: true };
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const totalDuration = end - new Date(end.getTime() - DEFAULT_EVALUATION_DAYS * 24 * 60 * 60 * 1000);
  const elapsed = totalDuration - diffMs;
  const percent = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
  return { days, hours, totalHours, percent, expired: false };
}

function getTone(days, hours, expired) {
  if (expired) return { bg: "bg-red-50", border: "border-red-200", bar: "bg-red-500", text: "text-red-700", icon: AlertTriangle };
  if (days <= 2) return { bg: "bg-red-50", border: "border-red-200", bar: "bg-red-500", text: "text-red-700", icon: AlertTriangle };
  if (days <= 5) return { bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500", text: "text-amber-700", icon: Clock };
  return { bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500", text: "text-emerald-700", icon: CheckCircle };
}

export default function EvaluationTimeRemaining({ evaluationEndsAt, compact = false }) {
  const info = useMemo(() => calcRemaining(evaluationEndsAt), [evaluationEndsAt]);
  if (!info) return null;

  const tone = getTone(info.days, info.hours, info.expired);
  const Icon = tone.icon;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
        <Icon className="h-3 w-3" />
        {info.expired ? (
          <span>Evaluation expired</span>
        ) : (
          <span>{info.days}d {info.hours}h left</span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${tone.bg} ${tone.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${tone.bg}`}>
            <Icon className={`h-4 w-4 ${tone.text}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${tone.text}`}>
              {info.expired ? "Evaluation Expired" : "Evaluation Time Remaining"}
            </p>
            <p className="text-xs text-slate-500">
              {info.expired
                ? "Contact sales to continue"
                : `Ends ${new Date(evaluationEndsAt).toLocaleDateString()}`
              }
            </p>
          </div>
        </div>
        {!info.expired && (
          <div className="text-right">
            <p className={`text-2xl font-extrabold ${tone.text}`}>{info.days}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {info.days === 1 ? "day" : "days"} + {info.hours}h
            </p>
          </div>
        )}
      </div>

      {!info.expired && (
        <div className="w-full h-2 rounded-full bg-white/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: `${100 - info.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
