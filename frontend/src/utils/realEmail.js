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

// System / role mailboxes nobody reads: refused for a person's own address (same list as the server's ROLE_LOCAL_PARTS).
const ROLE_LOCAL_PARTS = new Set(["noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply", "mailer-daemon", "postmaster"]);
export const ROLE_ADDRESS_MESSAGE = "Enter the person's own email address. System addresses such as noreply@ or postmaster@ are not accepted.";

/** realEmailError plus the person-only check (candidates, new hires). */
export function personEmailError(value) {
  const base = realEmailError(value);
  if (base) return base;
  const local = String(value ?? "").trim().split("@")[0].toLowerCase();
  return ROLE_LOCAL_PARTS.has(local) ? ROLE_ADDRESS_MESSAGE : "";
}

// Frequent typos of the big providers: shown as "Did you mean …?", never a refusal (same table as the server's DOMAIN_TYPOS).
const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmaill.com": "gmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com", "outlok.com": "outlook.com", "outllook.com": "outlook.com", "outlook.co": "outlook.com",
  "outlook.con": "outlook.com", "iclod.com": "icloud.com", "icloud.co": "icloud.com", "rediffmial.com": "rediffmail.com",
};

/** "name@gmail.com" for "name@gmial.com"; "" when the domain is not a known typo. */
export function suggestEmail(value) {
  const text = String(value ?? "").trim();
  const at = text.lastIndexOf("@");
  if (at < 1) return "";
  const fixed = DOMAIN_TYPOS[text.slice(at + 1).toLowerCase()];
  return fixed ? `${text.slice(0, at)}@${fixed}` : "";
}
