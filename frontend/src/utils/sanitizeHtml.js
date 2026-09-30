/**
 * utils/sanitizeHtml.js
 * ---------------------
 * The ONLY way notification HTML reaches the DOM. DOMPurify with a tight
 * allow-list (mirrors the backend sanitizer, which has already cleaned the
 * body on write — this is the second layer, applied on every render).
 */
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
  "blockquote", "code", "pre", "span", "div", "h1", "h2", "h3", "h4", "a",
];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

let hooked = false;
function ensureHook() {
  if (hooked || typeof DOMPurify.addHook !== "function") return;
  hooked = true;
  // Links always open safely in a new tab.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

export function sanitizeHtml(html) {
  if (!html) return "";
  ensureHook();
  return DOMPurify.sanitize(String(html), CONFIG);
}
