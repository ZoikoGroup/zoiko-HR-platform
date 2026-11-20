// Step 2: the analysis. It runs in the background; the admin can leave and come back.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { analyseDocsSetup, getDocsSetupSession } from "../../../../service/docsSetupService";
import { Banner, errorText } from "./shared";

export default function AnalyseStep({ session, onSession, onDone }) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const running = session.status === "analysing";

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      try {
        const s = await getDocsSetupSession(session.id);
        onSession(s);
        if (s.status === "review") onDone();
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      const s = await analyseDocsSetup(session.id);
      onSession(s);
      if (s.status === "review") onDone();
    } catch (e) {
      setError(errorText(e, "The analysis could not start."));
    } finally {
      setStarting(false);
    }
  };

  const files = session.files || [];
  const pct = session.progress?.files || {};
  return (
    <div className="space-y-4">
      {session.ai?.on ? (
        <Banner tone="info">
          <span className="inline-flex items-center gap-1 font-medium"><Sparkles className="h-4 w-4" />Automatic suggestions are on.</span>{" "}
          AI reads your documents (with personal details masked) and suggests settings. Every suggestion shows where it came from, and you decide
          what is applied.
        </Banner>
      ) : (
        <Banner tone="warn">
          Automatic suggestions are off{session.ai?.reason ? `: ${session.ai.reason}` : "."} We still find standard details (registration
          numbers, notice periods, pay and leave rules, clause headings) and you can map your documents yourself.
        </Banner>
      )}
      {session.status === "failed" && <Banner tone="error">{session.error || "The analysis stopped."}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      <ul className="space-y-2" aria-live="polite">
        {files.map((f) => {
          const p = Number(pct[String(f.id)] ?? (session.status === "review" ? 100 : 0));
          return (
            <li key={f.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-gray-800">{f.filename}</span>
                <span className="shrink-0 text-xs text-gray-600">{p >= 100 ? "Done" : running ? "Reading…" : "Waiting"}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={p} aria-valuemin={0}
                aria-valuemax={100} aria-label={`${f.filename} progress`}>
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${p}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {session.progress?.message && <p className="text-sm text-gray-600">{session.progress.message}</p>}
      {!running && session.status !== "review" && (
        <button type="button" onClick={start} disabled={starting || files.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {session.status === "failed" ? "Try again" : "Analyse my documents"}
        </button>
      )}
      {session.status === "review" && (
        <button type="button" onClick={start} disabled={starting}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />Analyse again (keeps your decisions)
        </button>
      )}
      {running && <p className="inline-flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />You can leave this page; the analysis keeps going.</p>}
    </div>
  );
}
