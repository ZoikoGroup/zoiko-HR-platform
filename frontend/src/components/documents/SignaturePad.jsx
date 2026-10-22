import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

// A small drawing pad for a hand-drawn signature. Pointer events cover mouse, pen and touch; `touch-action: none`
// stops the page scrolling while a finger draws. Every stroke ends with onChange(dataUrl) — a PNG data URL, or null
// when the pad is empty or the image would be over the backend's 200 KB limit. A drawn signature is always optional:
// the signing form keeps a typed name, so nobody who cannot use a pointer is blocked.

export const MAX_SIGNATURE_BYTES = 200 * 1024;

// Size of a base64 data URL's payload in bytes.
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || "").split(",")[1] || "";
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export default function SignaturePad({ onChange, height = 160, disabled = false, label = "Signature drawing area", id }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);

  // Match the canvas bitmap to its CSS size (and the device pixel ratio) so lines stay crisp.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    setHasInk(false);
    setTooLarge(false);
    onChange?.(null);
  }, [height, onChange]);

  useEffect(() => {
    resize();
    // Resizing clears the drawing, so only react to a width change (a phone rotating), not every scroll-bar flicker.
    let width = canvasRef.current?.getBoundingClientRect().width;
    const onResize = () => {
      const w = canvasRef.current?.getBoundingClientRect().width;
      if (w && Math.abs(w - width) > 2) {
        width = w;
        resize();
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
  };

  const move = (e) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const p = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = canvasRef.current.toDataURL("image/png");
    const big = dataUrlBytes(url) > MAX_SIGNATURE_BYTES;
    setHasInk(true);
    setTooLarge(big);
    onChange?.(big ? null : url);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasInk(false);
    setTooLarge(false);
    onChange?.(null);
  };

  const noteId = `${id || "signature-pad"}-note`;
  return (
    <div>
      <div className="relative">
        <canvas
          id={id}
          ref={canvasRef}
          role="img"
          aria-label={`${label}. ${hasInk ? "A signature has been drawn." : "Empty."} Draw with a mouse, pen or finger.`}
          aria-describedby={noteId}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className={`block w-full rounded-xl border-2 border-dashed bg-white ${disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"} ${hasInk ? "border-blue-300" : "border-slate-300"}`}
          style={{ height, touchAction: "none" }}
        />
        {!hasInk && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">
            Sign here
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={noteId} className="text-xs text-slate-500">You can type your name instead.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <Eraser size={14} aria-hidden="true" /> Clear drawing
        </button>
      </div>
      {tooLarge && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          The drawing is too detailed to save (over 200 KB). Clear it and draw a simpler signature, or use your typed name.
        </p>
      )}
    </div>
  );
}
