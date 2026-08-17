import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { submitFeedback } from "../../../service/assistantService";

const REASON_CODES = [
  { value: "incorrect", label: "Incorrect" },
  { value: "outdated", label: "Outdated" },
  { value: "not_enough_detail", label: "Not enough detail" },
  { value: "other", label: "Other" },
];

export default function FeedbackControl({ turnId }) {
  const [rating, setRating] = useState(null);
  const [reasonCode, setReasonCode] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const send = async (r, code) => {
    setRating(r);
    try {
      await submitFeedback(turnId, r, code || null);
      setSubmitted(true);
    } catch {
      // Non-critical UI feedback path — fail silently, user can retry.
    }
  };

  if (submitted) {
    return <p className="text-[11px] text-emerald-600 font-semibold">Thanks for the feedback.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => send("up")}
          className={`flex h-6 w-6 items-center justify-center rounded-full border ${rating === "up" ? "border-emerald-400 bg-emerald-50 text-emerald-600" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
          aria-label="Helpful"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setRating("down")}
          className={`flex h-6 w-6 items-center justify-center rounded-full border ${rating === "down" ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
          aria-label="Not helpful"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {rating === "down" && (
        <div className="flex flex-wrap gap-1.5">
          {REASON_CODES.map((rc) => (
            <button
              key={rc.value}
              type="button"
              onClick={() => send("down", rc.value)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${reasonCode === rc.value ? "border-[#FF7A00] text-[#FF7A00]" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
            >
              {rc.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
