export function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return `${formatDate(d)}, ${formatTime(d)}`;
}