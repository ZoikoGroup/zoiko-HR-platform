// Shown on every page while signed in with temporary support credentials: says the session is read-only, counts down
// to its end, and signs out when the time is up (the server refuses the token from then on anyway).
import { useEffect, useState } from "react";
import { Eye, Clock, LogOut } from "lucide-react";
import { supportLoginService, supportSessionClaims } from "../service/supportLoginService";
import { logout } from "../service/authService";

export default function SupportSessionBanner() {
  const [claims] = useState(() => supportSessionClaims());
  const [info, setInfo] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!claims) return undefined;
    supportLoginService.currentSession().then(setInfo).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [claims]);

  const expiresMs = claims ? claims.exp * 1000 : 0;
  const secs = Math.max(Math.floor((expiresMs - now) / 1000), 0);

  useEffect(() => {
    if (claims && secs === 0) {
      logout().finally(() => window.location.assign("/login"));
    }
  }, [claims, secs]);

  if (!claims) return null;

  const signOut = () => logout().finally(() => window.location.assign("/login"));

  return (
    <div role="status"
      className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900 shadow-lg">
      <Eye className="h-4 w-4" />
      <span className="font-semibold">Read-only support session</span>
      {info?.organization_name && <span className="text-amber-800">· {info.organization_name}</span>}
      {info?.reference && <span className="font-mono text-xs text-amber-700">{info.reference}</span>}
      <span className={`flex items-center gap-1 font-mono font-semibold ${secs < 60 ? "text-red-600" : ""}`}>
        <Clock className="h-4 w-4" /> {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </span>
      <button onClick={signOut} className="flex items-center gap-1 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold hover:bg-amber-100">
        <LogOut className="h-3.5 w-3.5" /> End session
      </button>
    </div>
  );
}
