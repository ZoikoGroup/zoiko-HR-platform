/**
 * components/OrganizationLogoCard.jsx
 * -----------------------------------
 * The organisation's logo, on the org admin / HR admin profile (My Organization) — QA bug 15: it heads every email the
 * organisation sends (interview invitations, results, offers, onboarding …) and the offer documents. It is the same logo
 * as Onboarding → Settings → Offer package (one logo, stored once: /hr/onboarding/package/logo).
 *
 * Shows a preview of an email header (logo + organisation name), and lets an admin upload, replace or remove the logo.
 */
import { useEffect, useId, useState } from "react";
import { ImagePlus, Loader2, Mail, Trash2 } from "lucide-react";
import { deleteOfferPackageLogo, getOfferPackageLogo, uploadOfferPackageLogo } from "../service/hrService";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_MB = 2;

export default function OrganizationLogoCard({ organizationName, className = "" }) {
  const titleId = useId();
  const [url, setUrl] = useState("");
  const [state, setState] = useState("loading");      // loading | none | ready | error
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);                 // { tone: ok | error, text }
  const [rev, setRev] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    let live = true;
    let objectUrl = "";
    setState("loading");
    getOfferPackageLogo()
      .then((res) => {
        if (!live) return;
        if (res?.blob) { objectUrl = URL.createObjectURL(res.blob); setUrl(objectUrl); setState("ready"); }
        else { setUrl(""); setState("none"); }
      })
      .catch((e) => {
        if (!live) return;
        setUrl("");
        if (e?.status === 404) { setState("none"); setMsg(null); }
        else { setState("error"); setMsg({ tone: "error", text: e?.message || "The logo could not be loaded." }); }
      });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [rev]);

  const upload = async (file) => {
    if (!file) return;
    setMsg(null);
    if (!TYPES.includes(file.type)) { setMsg({ tone: "error", text: "Upload the logo as a PNG, JPG or WebP image." }); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setMsg({ tone: "error", text: `The logo must be ${MAX_MB} MB or smaller.` }); return; }
    setBusy(true);
    try {
      await uploadOfferPackageLogo(file);
      setRev((r) => r + 1);
      setMsg({ tone: "ok", text: "Logo saved. Emails and new documents show it from now on." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The logo could not be uploaded." });
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await deleteOfferPackageLogo();
      setConfirming(false);
      setRev((r) => r + 1);
      setMsg({ tone: "ok", text: "Logo removed. Emails show your organisation's name on its own." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The logo could not be removed." });
    } finally {
      setBusy(false);
    }
  };

  const name = organizationName || "Your organisation";
  return (
    <section aria-labelledby={titleId} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-base font-semibold text-slate-900">Organization logo</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Shown at the top of every email your organisation sends (interview invitations and results, offers, onboarding) and on
            offer documents. PNG, JPG or WebP up to {MAX_MB} MB; a wide logo on a transparent background works best.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row [&>*]:min-w-0 [&>*]:flex-1">
        {/* the logo itself, with the actions */}
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-44 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
            {state === "loading" ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading the logo" />
              : state === "ready" ? <img src={url} alt={`${name} logo`} className="object-contain"
                style={{ display: "block", width: "auto", height: "auto", maxWidth: 160, maxHeight: 64 }} />
                : <span className="px-2 text-center text-xs text-slate-400">{state === "error" ? "Logo unavailable" : "No logo yet"}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
              {state === "ready" ? "Replace logo" : "Upload logo"}
              <input key={inputKey} type="file" accept={TYPES.join(",")} className="sr-only" aria-label="Organization logo file"
                onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
            </label>
            {state === "ready" && !confirming && (
              <button type="button" onClick={() => setConfirming(true)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
              </button>
            )}
            {confirming && (
              <span role="group" aria-label="Confirm removing the logo" className="inline-flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">Remove the logo?</span>
                <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">Remove</button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">Keep it</button>
              </span>
            )}
          </div>
        </div>

        {/* how an email header looks */}
        <div className="rounded-xl border border-slate-200 bg-[#eef2f6] p-3" aria-label="Email preview">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Email preview</p>
          <div className="overflow-hidden rounded-lg bg-white shadow-sm">
            <div className="flex h-1"><span className="w-[60%] bg-[#0b4a8b]" /><span className="w-[25%] bg-[#4cc3d9]" /><span className="w-[15%] bg-[#f0c43a]" /></div>
            <div className="flex items-center gap-3 px-4 py-3">
              {state === "ready" && <img src={url} alt="" className="object-contain"
                style={{ display: "block", width: "auto", height: "auto", maxWidth: 110, maxHeight: 32 }} />}
              <span className="truncate text-base font-bold text-slate-900">{name}</span>
            </div>
            <div className="space-y-1.5 px-4 pb-3" aria-hidden="true">
              <div className="h-2.5 w-3/4 rounded bg-slate-200" /><div className="h-2 w-full rounded bg-slate-100" /><div className="h-2 w-5/6 rounded bg-slate-100" />
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">Powered by Zoiko HR</div>
          </div>
        </div>
      </div>

      {msg && <p role={msg.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${msg.tone === "error" ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</p>}
    </section>
  );
}
