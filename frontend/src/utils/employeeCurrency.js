// Salary currency per employee: amounts are stored in the employee's local money, so every
// salary shown on the Users page is formatted in the currency of that employee's registered
// address (their `country`), never in one org-wide currency.

const FALLBACK = { code: "USD", locale: "en-US" };

// Country name (lowercase, punctuation-insensitive) -> { code, locale }.
const COUNTRY_CURRENCY = {
  "india": { code: "INR", locale: "en-IN" },
  "united states": { code: "USD", locale: "en-US" },
  "usa": { code: "USD", locale: "en-US" },
  "united states of america": { code: "USD", locale: "en-US" },
  "united kingdom": { code: "GBP", locale: "en-GB" },
  "uk": { code: "GBP", locale: "en-GB" },
  "great britain": { code: "GBP", locale: "en-GB" },
  "england": { code: "GBP", locale: "en-GB" },
  "ireland": { code: "EUR", locale: "en-IE" },
  "germany": { code: "EUR", locale: "de-DE" },
  "france": { code: "EUR", locale: "fr-FR" },
  "spain": { code: "EUR", locale: "es-ES" },
  "italy": { code: "EUR", locale: "it-IT" },
  "netherlands": { code: "EUR", locale: "nl-NL" },
  "belgium": { code: "EUR", locale: "nl-BE" },
  "austria": { code: "EUR", locale: "de-AT" },
  "portugal": { code: "EUR", locale: "pt-PT" },
  "greece": { code: "EUR", locale: "el-GR" },
  "finland": { code: "EUR", locale: "fi-FI" },
  "poland": { code: "PLN", locale: "pl-PL" },
  "sweden": { code: "SEK", locale: "sv-SE" },
  "norway": { code: "NOK", locale: "nb-NO" },
  "denmark": { code: "DKK", locale: "da-DK" },
  "switzerland": { code: "CHF", locale: "de-CH" },
  "czech republic": { code: "CZK", locale: "cs-CZ" },
  "czechia": { code: "CZK", locale: "cs-CZ" },
  "hungary": { code: "HUF", locale: "hu-HU" },
  "romania": { code: "RON", locale: "ro-RO" },
  "bulgaria": { code: "BGN", locale: "bg-BG" },
  "croatia": { code: "EUR", locale: "hr-HR" },
  "canada": { code: "CAD", locale: "en-CA" },
  "mexico": { code: "MXN", locale: "es-MX" },
  "brazil": { code: "BRL", locale: "pt-BR" },
  "argentina": { code: "ARS", locale: "es-AR" },
  "chile": { code: "CLP", locale: "es-CL" },
  "colombia": { code: "COP", locale: "es-CO" },
  "peru": { code: "PEN", locale: "es-PE" },
  "australia": { code: "AUD", locale: "en-AU" },
  "new zealand": { code: "NZD", locale: "en-NZ" },
  "singapore": { code: "SGD", locale: "en-SG" },
  "malaysia": { code: "MYR", locale: "ms-MY" },
  "thailand": { code: "THB", locale: "th-TH" },
  "vietnam": { code: "VND", locale: "vi-VN" },
  "indonesia": { code: "IDR", locale: "id-ID" },
  "philippines": { code: "PHP", locale: "en-PH" },
  "japan": { code: "JPY", locale: "ja-JP" },
  "south korea": { code: "KRW", locale: "ko-KR" },
  "korea": { code: "KRW", locale: "ko-KR" },
  "china": { code: "CNY", locale: "zh-CN" },
  "hong kong": { code: "HKD", locale: "en-HK" },
  "taiwan": { code: "TWD", locale: "zh-TW" },
  "sri lanka": { code: "LKR", locale: "en-LK" },
  "bangladesh": { code: "BDT", locale: "en-BD" },
  "pakistan": { code: "PKR", locale: "en-PK" },
  "nepal": { code: "NPR", locale: "en-NP" },
  "bhutan": { code: "BTN", locale: "en-BT" },
  "myanmar": { code: "MMK", locale: "en-MM" },
  "united arab emirates": { code: "AED", locale: "en-AE" },
  "uae": { code: "AED", locale: "en-AE" },
  "dubai": { code: "AED", locale: "en-AE" },
  "saudi arabia": { code: "SAR", locale: "en-SA" },
  "qatar": { code: "QAR", locale: "en-QA" },
  "kuwait": { code: "KWD", locale: "en-KW" },
  "bahrain": { code: "BHD", locale: "en-BH" },
  "oman": { code: "OMR", locale: "en-OM" },
  "israel": { code: "ILS", locale: "en-IL" },
  "turkey": { code: "TRY", locale: "tr-TR" },
  "turkiye": { code: "TRY", locale: "tr-TR" },
  "egypt": { code: "EGP", locale: "en-EG" },
  "south africa": { code: "ZAR", locale: "en-ZA" },
  "nigeria": { code: "NGN", locale: "en-NG" },
  "kenya": { code: "KES", locale: "en-KE" },
  "ghana": { code: "GHS", locale: "en-GH" },
  "russia": { code: "RUB", locale: "ru-RU" },
  "ukraine": { code: "UAH", locale: "uk-UA" },
};

function normalizeCountry(country) {
  return String(country || "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

/** { code, locale } for the employee's country; null when the country is missing or unknown. */
export function currencyForCountry(country) {
  const entry = COUNTRY_CURRENCY[normalizeCountry(country)];
  return entry ? { ...entry } : null;
}

/** ISO code ("INR") for the country, or "" when unknown. */
export function salaryCurrencyCode(country) {
  return currencyForCountry(country)?.code || "";
}

/** "Indian Rupee (INR)" for hints, or "" when the country maps to nothing known. */
export function salaryCurrencyName(country) {
  const entry = currencyForCountry(country);
  if (!entry) return "";
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" });
    const full = names.of(entry.code);
    return full ? `${full} (${entry.code})` : entry.code;
  } catch {
    return entry.code;
  }
}

/** 85000 + "India" -> "₹85,000"; unknown country -> the plain number, never a guessed symbol. */
export function formatSalary(amount, country) {
  if (amount === null || amount === undefined || amount === "") return "";
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  const entry = currencyForCountry(country);
  if (!entry) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat(entry.locale, {
      style: "currency",
      currency: entry.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
