// Renders the small formatting subset the assistant's prompt allows —
// paragraphs, "- " / "1. " lists and **bold** — as React elements. Never
// HTML: the text is model output, so nothing in it can create markup, links
// or scripts (architecture spec: sanitize rich text, no active content).

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;

function inline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={`${keyPrefix}-${i}`} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

function toBlocks(text) {
  const blocks = [];
  for (const line of text.split("\n")) {
    const bullet = line.match(BULLET_RE);
    const numbered = !bullet && line.match(NUMBERED_RE);
    const last = blocks[blocks.length - 1];
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      const item = (bullet || numbered)[1];
      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (!line.trim()) {
      if (last && last.type !== "gap") blocks.push({ type: "gap" });
    } else if (last?.type === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== "gap");
}

export default function AnswerText({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-2">
      {toBlocks(text).map((block, i) => {
        if (block.type === "p") {
          return <p key={i} className="whitespace-pre-line">{inline(block.lines.join("\n"), i)}</p>;
        }
        const List = block.type;
        return (
          <List key={i} className={`space-y-1 pl-5 ${List === "ul" ? "list-disc" : "list-decimal"}`}>
            {block.items.map((item, j) => <li key={j}>{inline(item, `${i}-${j}`)}</li>)}
          </List>
        );
      })}
    </div>
  );
}
