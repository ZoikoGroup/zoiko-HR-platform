// Real e-mail addresses only. Instant feedback in the forms; the server (backend/app/core/email_quality.py) is the authority and
// also checks that the domain can receive mail. The words of the messages are the same on both sides.

const PLACEHOLDER = new Set([
  "example.com", "example.org", "example.net", "example.edu", "example.co", "example.in",
  "test.com", "tests.com", "testing.com", "tester.com", "testmail.com", "testemail.com", "test.org", "test.net",
  "domain.com", "domain.org", "domain.net", "yourdomain.com", "yourcompany.com", "yourcompany.org", "mydomain.com", "mycompany.com",
  "sample.com", "demo.com", "dummy.com", "fake.com", "fakemail.com", "fakeemail.com", "noemail.com", "nomail.com",
  "none.com", "null.com", "invalid.com", "asdf.com", "abc.com", "xyz.com", "abcd.com", "qwerty.com", "no-reply.com",
]);
const RESERVED_SUFFIXES = [".test", ".example", ".invalid", ".localhost", ".local", ".localdomain", ".internal", ".lan", ".home", ".corp", ".intranet"];
const RESERVED_EXACT = new Set(["localhost", "localdomain", "invalid", "test", "example"]);
// the best known throwaway-inbox services (the server knows several hundred more)
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempinbox.com", "yopmail.com", "yopmail.net", "yopmail.fr", "trashmail.com", "trashmail.net",
  "getnada.com", "nada.email", "throwawaymail.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mintemail.com", "mailnesia.com", "mailcatch.com",
  "spamgourmet.com", "emailondeck.com", "mohmal.com", "moakt.com", "burnermail.io", "discard.email", "33mail.com", "anonbox.net", "inboxkitten.com",
  "harakirimail.com", "jourrapide.com", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com", "rhyta.com", "teleworm.us", "tmpmail.org", "tmpeml.com",
]);

export const PLACEHOLDER_MESSAGE = "Enter a real email address that you can open. Placeholder addresses such as name@example.com are not accepted.";
export const DISPOSABLE_MESSAGE = "Temporary or disposable email addresses are not accepted. Use your real work or personal email address.";
export const SHAPE_MESSAGE = "Enter a valid email address, for example name@yourcompany.com.";

const domainOf = (email) => String(email || "").trim().toLowerCase().split("@").pop().replace(/\.$/, "");

/** "" when the address looks real (or is blank: required-ness is the caller's business), otherwise the message to show. */
export function realEmailError(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return SHAPE_MESSAGE;
  const domain = domainOf(text);
  if (RESERVED_EXACT.has(domain) || PLACEHOLDER.has(domain) || RESERVED_SUFFIXES.some((s) => domain.endsWith(s)) || domain.endsWith(".example.com")) return PLACEHOLDER_MESSAGE;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (DISPOSABLE.has(parts.slice(i).join("."))) return DISPOSABLE_MESSAGE;
  return "";
}
