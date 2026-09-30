/**
 * __tests__/notifications.test.mjs
 * ---------------------------------
 * ZHR-19 / ZHR-20 frontend: helpers, sanitised rendering, the Super Admin email
 * icon (click + keyboard), and the bell badge.
 *
 * Service modules are stubbed with ONE shared object per file (module-level), so
 * already-cached dependents (e.g. the unread hook) keep seeing the same stub.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";
import { formatBadge, relativeTime } from "../src/utils/notificationFormat.js";
import { sanitizeHtml } from "../src/utils/sanitizeHtml.js";

// ── shared stubs ─────────────────────────────────────────────────────────────
const notificationService = {
  list: async () => ({ items: [], total: 0, unread_count: 0 }),
  getUnreadCount: async () => ({ unread_count: 0 }),
  get: async () => ({}),
  markRead: async () => ({ unread_count: 0 }),
  markUnread: async () => ({ unread_count: 0 }),
  markAllRead: async () => ({ updated: 0, unread_count: 0 }),
};
const superAdminService = {
  getNotifications: async () => ({ notifications: [], total: 0 }),
  getNotification: async () => ({}),
  markNotificationRead: async () => ({}),
  deleteNotification: async () => ({}),
  createNotification: async () => ({}),
  getOrganizations: async () => ({ organizations: [] }),
};

const DEFAULT_NOTIFICATION_SERVICE = { ...notificationService };
const DEFAULT_SUPER_ADMIN_SERVICE = { ...superAdminService };
const mocked = new WeakSet();

// One mock registration per test (node forbids mocking a module twice in a test),
// and the shared stubs are reset so no test sees another test's overrides.
function mockModules(t) {
  Object.assign(notificationService, DEFAULT_NOTIFICATION_SERVICE);
  Object.assign(superAdminService, DEFAULT_SUPER_ADMIN_SERVICE);
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/notificationService.js", { exports: { notificationService } });
  t.mock.module("../src/service/superAdminService.js", { exports: { superAdminService } });
  t.mock.module("react-router-dom", {
    exports: {
      Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
      Navigate: ({ to }) => React.createElement("div", { "data-testid": "redirect" }, to),
      useNavigate: () => () => {},
    },
  });
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });

// ── pure helpers ─────────────────────────────────────────────────────────────
test("formatBadge hides zero and caps at 99+", () => {
  assert.equal(formatBadge(0), "");
  assert.equal(formatBadge(undefined), "");
  assert.equal(formatBadge(7), "7");
  assert.equal(formatBadge(99), "99");
  assert.equal(formatBadge(100), "99+");
  assert.equal(formatBadge(4321), "99+");
});

test("relativeTime buckets", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.equal(relativeTime("2026-09-30T11:59:40Z", now), "just now");
  assert.equal(relativeTime("2026-09-30T11:55:00Z", now), "5 min ago");
  assert.equal(relativeTime("2026-09-30T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2026-09-28T12:00:00Z", now), "2 d ago");
  assert.match(relativeTime("2026-08-01T12:00:00Z", now), /^\d{2} [A-Z][a-z]{2} 2026$/);
  assert.equal(relativeTime(null, now), "");
  assert.equal(relativeTime("garbage", now), "");
});

test("sanitizeHtml removes scripts, handlers and unsafe links but keeps formatting", () => {
  const out = sanitizeHtml(
    '<p>Hi <b>there</b></p><script>alert(1)</script><img src=x onerror="alert(2)">' +
    '<a href="javascript:alert(3)" onclick="x()">bad</a><a href="https://zoikohr.com">ok</a>' +
    "<style>p{display:none}</style><iframe src='https://evil'></iframe>",
  );
  assert.ok(!/<script|onerror|onclick|javascript:|<img|<style|<iframe/i.test(out), out);
  assert.match(out, /<b>there<\/b>/);
  assert.match(out, /href="https:\/\/zoikohr\.com"/);
  assert.match(out, /rel="noopener noreferrer nofollow"/);
  assert.equal(sanitizeHtml(null), "");
});

// ── shared detail component ──────────────────────────────────────────────────
async function renderContent(t, props) {
  cleanup();
  mockModules(t);
  const mod = await import(`../src/components/notifications/NotificationContent.jsx?t=${Math.random()}`);
  await act(async () => { render(React.createElement(mod.default, props)); });
}

const BASE = {
  id: 1, title: "Policy update", sender_name: "Zoiko HR Admin", priority: "high", notification_type: "announcement",
  sent_at: "2026-09-30T09:21:52Z", body_html: "<p>Hello <b>team</b></p>", content_available: true,
};

test("NotificationContent: renders title, sender and sanitised body", async (t) => {
  await renderContent(t, { notification: BASE });
  assert.ok(screen.getByText("Policy update"));
  assert.ok(screen.getByText("Zoiko HR Admin"));
  assert.equal(screen.getByTestId("notification-body").querySelector("b").textContent, "team");
});

test("NotificationContent: a malicious body never reaches the DOM as live markup", async (t) => {
  globalThis.__pwned = false;
  await renderContent(t, {
    notification: { ...BASE, body_html: '<script>globalThis.__pwned=true</script><img src=x onerror="globalThis.__pwned=true"><p>safe</p>' },
  });
  const body = screen.getByTestId("notification-body");
  assert.equal(body.querySelector("script"), null);
  assert.equal(body.querySelector("img"), null);
  assert.equal(body.innerHTML.includes("onerror"), false);
  assert.equal(globalThis.__pwned, false);
  assert.equal(body.textContent, "safe");
});

test("NotificationContent: recipients never see admin-only sections; admins do", async (t) => {
  const admin = { ...BASE, target_summary: "Acme Ltd (org admins only)", targets: [{ kind: "org", ref: "1", label: "Acme Ltd" }],
    channels: ["in_app"], stats: { recipient_count: 3, read_count: 1, unread_count: 2 } };
  await renderContent(t, { notification: admin, isAdmin: false });
  assert.equal(screen.queryByText(/Audience & delivery/i), null);
  assert.equal(screen.queryByText(/Acme Ltd/), null);
  await renderContent(t, { notification: admin, isAdmin: true });
  assert.ok(screen.getByText(/Audience & delivery/i));
  assert.ok(screen.getByText("Acme Ltd (org admins only)"));
  assert.ok(screen.getByText("1 of 3"));
});

test("NotificationContent: legacy row without content shows a clear message", async (t) => {
  await renderContent(t, { notification: { ...BASE, body_html: "", content_available: false } });
  assert.ok(screen.getByText("Content not available for this notification"));
  assert.equal(screen.queryByTestId("notification-body"), null);
});

test("NotificationContent: loading and error-with-retry states", async (t) => {
  await renderContent(t, { loading: true });
  assert.ok(screen.getByRole("status", { name: /loading notification/i }));
  let retried = 0;
  await renderContent(t, { error: "boom", onRetry: () => { retried += 1; } });
  assert.ok(screen.getByRole("alert"));
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  assert.equal(retried, 1);
});

// ── ZHR-19: Super Admin email icon ───────────────────────────────────────────
const ADMIN_ROWS = [
  { id: 7, title: "Maintenance window", message: "Tonight", notification_type: "info", priority: "normal",
    is_read: false, created_at: "2026-09-30T09:00:00Z", sent_at: "2026-09-30T09:00:00Z", target_summary: "All users", content_available: true },
  { id: 8, title: "Read already", message: "Older", notification_type: "info", priority: "normal",
    is_read: true, created_at: "2026-09-29T09:00:00Z", sent_at: "2026-09-29T09:00:00Z", target_summary: "All users", content_available: true },
];

async function renderCenter(t) {
  cleanup();
  mockModules(t);
  superAdminService.getNotifications = async () => ({ notifications: ADMIN_ROWS, total: 2 });
  const mod = await import(`../src/modules/super-admin/NotificationCenter.jsx?t=${Math.random()}`);
  await act(async () => { render(React.createElement(mod.default)); });
  await settle();
}

test("ZHR-19: the email icon is a labelled, focusable native button for READ and UNREAD rows", async (t) => {
  await renderCenter(t);
  for (const row of ADMIN_ROWS) {
    const btn = screen.getByRole("button", { name: `View notification: ${row.title}` });
    assert.equal(btn.tagName, "BUTTON");          // native => Enter/Space activate it
    assert.notEqual(btn.getAttribute("tabindex"), "-1");
    assert.equal(btn.disabled, false);
    btn.focus();
    assert.equal(document.activeElement, btn);
  }
});

test("ZHR-19: clicking the email icon opens the full content (admin view)", async (t) => {
  await renderCenter(t);
  const calls = [];
  superAdminService.getNotification = async (id) => {
    calls.push(id);
    return { ...ADMIN_ROWS[0], body_html: "<p>Full <b>body</b></p>", sender_name: "Zoiko HR Admin",
      channels: ["in_app"], targets: [], stats: { recipient_count: 5, read_count: 2, unread_count: 3 } };
  };
  fireEvent.click(screen.getByRole("button", { name: "View notification: Maintenance window" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: /notification details/i });
  assert.deepEqual(calls, [7]);
  assert.equal(within(dialog).getByTestId("notification-body").textContent, "Full body");
  assert.ok(within(dialog).getByText("2 of 5"));        // admin-only stats present
});

test("ZHR-19: a focused icon activated by the keyboard opens it too, and Escape closes it", async (t) => {
  await renderCenter(t);
  superAdminService.getNotification = async () => ({ ...ADMIN_ROWS[1], body_html: "<p>x</p>" });
  const btn = screen.getByRole("button", { name: "View notification: Read already" });
  btn.focus();
  // A keyboard user activates a focused <button> with Enter/Space, which the browser
  // turns into a click; assert that path by clicking the focused element.
  fireEvent.click(document.activeElement);
  await settle();
  assert.ok(screen.getByRole("dialog"));
  fireEvent.keyDown(document, { key: "Escape" });
  await settle();
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, btn);             // focus returns to the opener
});

test("ZHR-19: a failing detail request shows an error with retry INSIDE the dialog", async (t) => {
  await renderCenter(t);
  let attempts = 0;
  superAdminService.getNotification = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Notification not found");
    return { ...ADMIN_ROWS[0], body_html: "<p>recovered</p>" };
  };
  fireEvent.click(screen.getByRole("button", { name: "View notification: Maintenance window" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  assert.ok(within(dialog).getByText("Notification not found"));
  fireEvent.click(within(dialog).getByRole("button", { name: /retry/i }));
  await settle();
  assert.equal(within(dialog).getByTestId("notification-body").textContent, "recovered");
});

// ── ZHR-20: bell ─────────────────────────────────────────────────────────────
const ITEMS = [
  { id: 1, title: "First", preview: "p1", sender_name: "Zoiko HR Admin", sent_at: "2026-09-30T09:00:00Z", is_read: false },
  { id: 2, title: "Second", preview: "p2", sender_name: "Zoiko HR Admin", sent_at: "2026-09-29T09:00:00Z", is_read: false },
  { id: 3, title: "Third", preview: "p3", sender_name: "Zoiko HR Admin", sent_at: "2026-09-28T09:00:00Z", is_read: true },
];

async function renderBell(t, unread) {
  cleanup();
  mockModules(t);
  notificationService.getUnreadCount = async () => ({ unread_count: unread });
  notificationService.list = async () => ({ items: ITEMS, total: 3, unread_count: unread });
  const mod = await import(`../src/components/NotificationBell.jsx?t=${Math.random()}`);
  await act(async () => { render(React.createElement(mod.default)); });
  await settle();
}

test("bell: shows the unread badge and caps it at 99+", async (t) => {
  await renderBell(t, 3);
  assert.equal(screen.getByTestId("notification-badge").textContent, "3");
  assert.ok(screen.getByRole("button", { name: /notifications, 3 unread/i }));
  await renderBell(t, 150);
  assert.equal(screen.getByTestId("notification-badge").textContent, "99+");
  await renderBell(t, 0);
  assert.equal(screen.queryByTestId("notification-badge"), null);
});

test("bell: opening a notification updates the badge immediately from the server count", async (t) => {
  await renderBell(t, 2);
  let fetchedCount = 0;
  notificationService.getUnreadCount = async () => { fetchedCount += 1; return { unread_count: 2 }; };
  fireEvent.click(screen.getByRole("button", { name: /notifications, 2 unread/i }));
  await settle();
  notificationService.get = async (id) => ({ ...ITEMS[0], id, body_html: "<p>hi</p>", content_available: true, unread_count: 1 });
  fireEvent.click(screen.getByRole("button", { name: /First/ }));
  await settle();
  assert.equal(screen.getByTestId("notification-badge").textContent, "1");   // no poll needed
  assert.equal(fetchedCount, 0);
});

test("bell: Mark all as read clears the badge and only calls the scoped endpoint", async (t) => {
  await renderBell(t, 2);
  let called = 0;
  notificationService.markAllRead = async () => { called += 1; return { updated: 2, unread_count: 0 }; };
  fireEvent.click(screen.getByRole("button", { name: /notifications, 2 unread/i }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
  await settle();
  assert.equal(called, 1);
  assert.equal(screen.queryByTestId("notification-badge"), null);
});

test("bell: dropdown lists the latest items with unread styling and a View all link", async (t) => {
  await renderBell(t, 2);
  fireEvent.click(screen.getByRole("button", { name: /notifications, 2 unread/i }));
  await settle();
  assert.ok(screen.getByText("First") && screen.getByText("Second") && screen.getByText("Third"));
  assert.equal(screen.getAllByText("Unread").length, 2);                      // sr-only markers
  assert.equal(screen.getByRole("link", { name: /view all/i }).getAttribute("href"), "/shared/notifications");
});

test("bell: refetches the count when the window regains focus", async (t) => {
  await renderBell(t, 1);
  notificationService.getUnreadCount = async () => ({ unread_count: 5 });
  await act(async () => { window.dispatchEvent(new window.Event("focus")); });
  await waitFor(() => assert.equal(screen.getByTestId("notification-badge").textContent, "5"));
});

test("bell: empty dropdown says there is nothing", async (t) => {
  cleanup();
  mockModules(t);
  notificationService.getUnreadCount = async () => ({ unread_count: 0 });
  notificationService.list = async () => ({ items: [], total: 0, unread_count: 0 });
  const mod = await import(`../src/components/NotificationBell.jsx?t=${Math.random()}`);
  await act(async () => { render(React.createElement(mod.default)); });
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await settle();
  assert.ok(screen.getByText("You have no notifications"));
});

// ── ZHR-20: inbox page ───────────────────────────────────────────────────────
async function renderInbox(t, role = "employee", setup = () => {}) {
  cleanup();
  mockModules(t);
  setup();
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ role }) } });
  const mod = await import(`../src/pages/NotificationsPage.jsx?t=${Math.random()}`);
  await act(async () => { render(React.createElement(mod.default)); });
  await settle();
}

test("inbox: super admins are redirected to their own Notification Center", async (t) => {
  await renderInbox(t, "super_admin");
  assert.equal(screen.getByTestId("redirect").textContent, "/super-admin/notifications");
});

test("inbox: empty states differ between All and Unread", async (t) => {
  await renderInbox(t, "employee", () => {
    notificationService.list = async () => ({ items: [], total: 0, unread_count: 0 });
  });
  assert.ok(screen.getByText("You have no notifications"));
  fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
  await settle();
  assert.ok(screen.getByText("You're all caught up"));
});

test("inbox: lists items, toggles read state and reports the new count", async (t) => {
  const seen = [];
  let toggled = null;
  await renderInbox(t, "employee", () => {
    notificationService.list = async (params) => { seen.push(params); return { items: ITEMS, total: 3, unread_count: 2 }; };
    notificationService.markRead = async (id) => { toggled = ["read", id]; return { unread_count: 1 }; };
    notificationService.markUnread = async (id) => { toggled = ["unread", id]; return { unread_count: 3 }; };
  });
  assert.equal(seen[0].filter, "all");
  assert.ok(screen.getByText("First"));
  fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);
  await settle();
  assert.deepEqual(toggled, ["read", 1]);
  fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
  await settle();
  assert.deepEqual(toggled, ["unread", 3]);
});

test("inbox: a failed load shows an error with retry", async (t) => {
  let attempts = 0;
  await renderInbox(t, "employee", () => {
    notificationService.list = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Network down");
      return { items: ITEMS, total: 3, unread_count: 2 };
    };
  });
  assert.ok(screen.getByText("Network down"));
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  await settle();
  assert.ok(screen.getByText("First"));
});
