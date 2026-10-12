// Contact HR validation utilities (mirrors server-side rules in ContactHRRequest)
// Single source of truth for topic list, message length, and sanitization.

export const CONTACT_HR_TOPICS = [
  "Leave balance not set up",
  "Leave request question",
  "Payroll or payslip",
  "Profile or documents",
  "Other",
];

export const MAX_MESSAGE_LENGTH = 1000;
export const MIN_MESSAGE_LENGTH = 10;

/** Normalize message: trim, collapse internal whitespace, keep intentional newlines. */
export function normalizeMessage(raw) {
  if (raw == null) return "";
  const s = String(raw).replace(/\r/g, "");
  // Preserve newlines but collapse internal whitespace (spaces/tabs), then trim each line, then trim overall
  return s.split("\n").map((ln) => ln.replace(/\s+/g, " ").trim()).join("\n").trim();
}

/** Validate topic. Returns null if valid, error string if invalid. */
export function validateTopic(topic) {
  if (!topic) return "Choose a topic.";
  if (!CONTACT_HR_TOPICS.includes(topic)) return "Choose a topic from the list.";
  return null;
}

/** Validate message. Returns null if valid, error string if invalid. */
export function validateMessage(message) {
  const normalized = normalizeMessage(message);
  if (normalized.length < MIN_MESSAGE_LENGTH) {
    return `Write a few words so HR knows how to help (at least ${MIN_MESSAGE_LENGTH} characters).`;
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    return `The message can be at most ${MAX_MESSAGE_LENGTH} characters.`;
  }
  return null;
}

/** Full validation for the contact HR form. Returns { topicError, messageError, normalizedMessage }. */
export function validateContactHRForm(topic, message) {
  return {
    topicError: validateTopic(topic),
    messageError: validateMessage(message),
    normalizedMessage: normalizeMessage(message),
  };
}