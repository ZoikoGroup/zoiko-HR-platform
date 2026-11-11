/**
 * utils/notificationType.js
 * -------------------------
 * The icon and label shown next to a notification, by its notification_type (A5). Unknown types fall back to a bell.
 */
import { Bell, CalendarCheck, Clock, Receipt, Plane, FileText, ClipboardList, TrendingUp, ShieldCheck, Info } from "lucide-react";

const TYPES = {
  leave: { icon: CalendarCheck, label: "Leave" },
  attendance: { icon: Clock, label: "Attendance" },
  expense: { icon: Receipt, label: "Expenses" },
  travel: { icon: Plane, label: "Travel" },
  document: { icon: FileText, label: "Documents" },
  onboarding: { icon: ClipboardList, label: "Onboarding" },
  performance: { icon: TrendingUp, label: "Performance" },
  approval: { icon: ShieldCheck, label: "Approvals" },
  info: { icon: Info, label: "Information" },
};

export function notificationTypeMeta(type) {
  return TYPES[String(type || "").toLowerCase()] || { icon: Bell, label: "Notification" };
}

/** Only in-app paths are followed; anything else (an external URL, "javascript:") is ignored. */
export function safeNotificationLink(link) {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
