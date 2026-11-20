/** A5: the Notifications page shows a type icon, the time and a working link; the bell re-checks right after an action. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { withQuery } from "./support/queryWrapper.mjs";
import { notificationTypeMeta, safeNotificationLink } from "../src/utils/notificationType.js";

afterEach(() => cleanup());
const settle = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const LEAVE = {
  id: 7, title: "Leave approved", preview: "Your leave request for 12–14 Nov has been approved.", sender_name: "Zoiko HR",
  notification_type: "leave", priority: "normal", sent_at: new Date().toISOString(), is_read: false, link: "/employee/leaves?request=3",
};

test("A5 type meta: known types get their own icon and label, unknown ones a bell", () => {
  assert.equal(notificationTypeMeta("leave").label, "Leave");
  assert.equal(notificationTypeMeta("expense").label, "Expenses");
  assert.equal(notificationTypeMeta("nonsense").label, "Notification");
});

test("A5 only in-app links are followed", () => {
  assert.equal(safeNotificationLink("/employee/leaves?request=3"), "/employee/leaves?request=3");
  assert.equal(safeNotificationLink("https://evil.example"), null);
  assert.equal(safeNotificationLink("//evil.example"), null);
  assert.equal(safeNotificationLink("javascript:alert(1)"), null);
  assert.equal(safeNotificationLink(null), null);
});

test("A5 the Notifications page lists a leave notification with its type, time and an Open link that marks it read", async (t) => {
  const marked = [];
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ role: "employee" }) } });
  t.mock.module("../src/service/notificationService.js", { exports: { notificationService: {
    list: async () => ({ items: [LEAVE], total: 1, unread_count: 1 }),
    markRead: async (id) => { marked.push(id); return { unread_count: 0 }; },
    markUnread: async () => ({ unread_count: 1 }), markAllRead: async () => ({ unread_count: 0 }), get: async () => LEAVE,
  } } });
  const { default: Page } = await import(`../src/pages/NotificationsPage.jsx?a5=${Math.random()}`);
  render(withQuery(React.createElement(MemoryRouter, null, React.createElement(Page))));
  await settle();
  assert.match(document.body.textContent, /Your leave request for 12–14 Nov has been approved\./);
  assert.ok(screen.getByTitle("Leave"), "type icon");
  assert.ok(document.querySelector("time"), "time shown");
  const open = screen.getByRole("link", { name: "Open: Leave approved" });
  assert.equal(open.getAttribute("href"), "/employee/leaves?request=3");
  fireEvent.click(open);
  await settle();
  assert.deepEqual(marked, [7]);
});

test("A5 a successful change made through the API re-checks the unread count; notification/assistant/support calls do not", async (t) => {
  const events = [];
  window.addEventListener("zoiko-api-mutation", (e) => events.push(e.detail.path));
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  const { apiRequest } = await import(`../src/service/api.js?a5=${Math.random()}`);
  await apiRequest("/hr/leaves/3/review", { method: "PUT", body: { status: "approved" } });
  await settle(900);
  assert.deepEqual(events, ["/hr/leaves/3/review"]);
  events.length = 0;
  await apiRequest("/notifications/read-all", { method: "POST" });
  await apiRequest("/assistant/conversations", { method: "POST", body: {} });
  await apiRequest("/super-admin/support/tickets", { method: "POST", body: {} });
  await apiRequest("/hr/leaves", { method: "GET" });
  await settle(900);
  assert.deepEqual(events, [], "no extra refresh for reads, notifications, the assistant or support tickets");
});
