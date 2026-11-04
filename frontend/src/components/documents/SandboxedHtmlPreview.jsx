// Shows server-rendered document HTML (generated documents, template previews) in a fully sandboxed iframe:
// no scripts, no same-origin access, no navigation. The HTML is built and escaped by the backend renderer; the sandbox is
// a second line of defence so a document can never run code or read the app's session.
export default function SandboxedHtmlPreview({ html, title = "Document preview", className = "", height = 640 }) {
  if (!html) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 ${className}`} style={{ height }}>
        No preview available.
      </div>
    );
  }
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
      className={`w-full rounded-xl border border-gray-200 bg-white ${className}`}
      style={{ height }}
    />
  );
}
