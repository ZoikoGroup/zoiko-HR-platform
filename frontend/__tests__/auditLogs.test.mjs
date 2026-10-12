import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_AUDIT_FILTERS, buildAuditParams, filtersFromSearchParams, filtersToSearchParams,
  hasActiveAuditFilters,
} from "../src/utils/auditFilters.js";
import { formatUtc, formatDateTimeWithZone } from "../src/utils/dateTime.js";

test("inclusive day range -> [local midnight first day, local midnight after last day) as UTC", () => {
  const p = buildAuditParams({ ...EMPTY_AUDIT_FILTERS, dateFrom: "2026-09-10", dateTo: "2026-09-12" });
  assert.equal(p.created_from, new Date(2026, 8, 10).toISOString());
  assert.equal(p.created_before, new Date(2026, 8, 13).toISOString());
});

test("last day of a month/year rolls the exclusive bound over correctly", () => {
  assert.equal(buildAuditParams({ ...EMPTY_AUDIT_FILTERS, dateTo: "2026-12-31" }).created_before,
    new Date(2027, 0, 1).toISOString());
  assert.equal(buildAuditParams({ ...EMPTY_AUDIT_FILTERS, dateTo: "2028-02-29" }).created_before,
    new Date(2028, 2, 1).toISOString());
});

test("only set filters are sent; page params always present; text is trimmed", () => {
  const p = buildAuditParams({ ...EMPTY_AUDIT_FILTERS, action: "login", actor: "  a@b.c ", entityId: "7" },
    { page: 2, pageSize: 25 });
  assert.deepEqual(p, { page: 2, page_size: 25, action: "login", entity_id: 7, actor: "a@b.c" });
});

test("blank / whitespace-only text filters are dropped", () => {
  const p = buildAuditParams({ ...EMPTY_AUDIT_FILTERS, search: "   ", ip: "" });
  assert.equal("search" in p, false);
  assert.equal("ip" in p, false);
});

test("URL round trip keeps every filter and page, and omits empties", () => {
  const filters = { ...EMPTY_AUDIT_FILTERS, action: "delete", entityType: "Organization", entityId: "3",
    actor: "x@y.z", search: "acme", ip: "2001:db8::1", dateFrom: "2026-09-01", dateTo: "2026-09-30" };
  const qs = filtersToSearchParams(filters, 4);
  assert.equal(qs.get("page"), "4");
  assert.deepEqual(filtersFromSearchParams(new URLSearchParams(qs.toString())), filters);
  assert.equal(filtersToSearchParams(EMPTY_AUDIT_FILTERS, 1).toString(), "");
});

test("deep links from the Organizations page still seed the filter", () => {
  const f = filtersFromSearchParams(new URLSearchParams("entity_type=Organization&entity_id=12"));
  assert.equal(f.entityType, "Organization");
  assert.equal(buildAuditParams(f).entity_id, 12);
});

test("hasActiveAuditFilters", () => {
  assert.equal(hasActiveAuditFilters(EMPTY_AUDIT_FILTERS), false);
  assert.equal(hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, ip: "1.2.3.4" }), true);
});

test("formatUtc shows the exact stored instant regardless of viewer timezone", () => {
  assert.equal(formatUtc("2026-09-30T09:21:52.477219Z"), "2026-09-30 09:21:52 UTC");
});

test("a Z-suffixed API timestamp parses to the same instant (no local-time drift)", () => {
  assert.equal(new Date("2026-09-30T09:21:52Z").getTime(), Date.UTC(2026, 8, 30, 9, 21, 52));
});

test("formatDateTimeWithZone includes seconds and an explicit zone label", () => {
  const out = formatDateTimeWithZone("2026-09-30T09:21:52Z");
  assert.match(out, /^\d{2} [A-Z][a-z]{2} 2026, \d{2}:\d{2}:\d{2} \S+/);
  assert.match(out, /(GMT|UTC|IST)/);
});

test("unparseable timestamps fall back to the raw value instead of throwing", () => {
  assert.equal(formatDateTimeWithZone("garbage"), "garbage");
  assert.equal(formatUtc(null), "");
});
