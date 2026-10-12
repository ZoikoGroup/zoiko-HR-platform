/** Notification Center on the query cache. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 200) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const calls = { list: [], read: [] };
let readIds = new Set();
const row = (id) => ({ id, title: `Notice ${id}`, message: "m", notification_type: "info", priority: "normal", target_type: "all", is_read: readIds.has(id), created_at: "2026-10-01T10:00:00Z", sent_at: "2026-10-01T10:00:00Z", target_summary: "All users", content_available: true });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getNotifications: async (p) => { calls.list.push(p); return { notifications: [row(1), row(2)], total: 2 }; },
  markNotificationRead: async (id) => { calls.read.push(id); readIds.add(id); return {}; },
  deleteNotification: async () => ({}), createNotification: async () => ({}), getNotification: async () => ({}),
  getOrganizations: async () => ({ organizations: [], total: 0 }),
} } });
mock.module("../src/components/OrgPicker.jsx", { exports: { default: () => null } });
const { default: Page } = await import("../src/modules/super-admin/NotificationCenter.jsx");
const { keys } = await import("../src/service/queryKeys.js");

test("a revisit within the freshness window shows the notifications at once with no new request", async () => {
  calls.list = []; readIds = new Set();
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle();
  assert.match(document.body.textContent, /Notice 1/);
  assert.equal(calls.list.length, 1);
  first.unmount();
  render(withQuery(h(Page), client));
  assert.match(document.body.textContent, /Notice 2/);
  await settle();
  assert.equal(calls.list.length, 1);
});

test("marking a notification read refetches the list (every page and filter is stale)", async () => {
  calls.list = []; calls.read = []; readIds = new Set();
  const client = testQueryClient();
  client.setQueryData(keys.superAdmin.notifications.list({ page: 3, page_size: 20, is_read: false }), { notifications: [], total: 0 });
  render(withQuery(h(Page), client));
  await settle();
  const markButtons = screen.getAllByRole("button", { name: /mark.*read/i });
  assert.ok(markButtons.length > 0, "an unread row offers Mark as read");
  fireEvent.click(markButtons[0]);
  await settle();
  assert.equal(calls.read.length, 1);
  assert.equal(calls.list.length, 2, "list refetched after the action");
  assert.equal(client.getQueryState(keys.superAdmin.notifications.list({ page: 3, page_size: 20, is_read: false })).isInvalidated, true);
});
