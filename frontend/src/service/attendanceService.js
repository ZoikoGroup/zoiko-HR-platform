/**
 * Attendance engine API (attendance plan §5). Thin wrappers over service/api.js; errors carry `.status` and `.code`
 * (ATT_ALREADY_IN, ATT_NOT_IN, ATT_ALREADY_OUT, ATT_ON_BREAK, ATT_NOT_ON_BREAK, ATT_DAY_CLOSED, ATT_LOCKED, ATT_PUNCH_DISABLED).
 */
import { api } from "./api";

// ── me ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const getMyAttendanceToday = () => api.get("/hr/me/attendance/today");
export const punchIn = () => api.post("/hr/me/attendance/punch-in", {});
export const punchOut = (note) => api.post("/hr/me/attendance/punch-out", note ? { note } : {});
export const startBreak = () => api.post("/hr/me/attendance/break/start", {});
export const endBreak = () => api.post("/hr/me/attendance/break/end", {});
export const getMyAttendanceMonth = (month) => api.get("/hr/me/attendance", month ? { params: { month } } : undefined);
export const getMyAttendanceDay = (date) => api.get(`/hr/me/attendance/days/${date}`);

// ── admin: the attendance log (attendance plan M5) ─────────────────────────────────────────────────────────────────
const clean = (p = {}) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
export const listAttendanceRecords = (params, opts = {}) => api.get("/hr/attendance/records", { params: clean(params), ...opts });
export const getAttendanceRecord = (id) => api.get(`/hr/attendance/records/${id}`);
export const createAttendanceRecord = (data) => api.post("/hr/attendance/records", data);
export const updateAttendanceRecord = ({ id, ...data }) => api.patch(`/hr/attendance/records/${id}`, data);
export const deleteAttendanceRecord = ({ id, reason }) => api.delete(`/hr/attendance/records/${id}`, { params: { reason } });
export const getAttendanceRecordAudit = (id) => api.get(`/hr/attendance/records/${id}/audit`);
export const getAttendanceToday = (params) => api.get("/hr/attendance/dashboard/today", { params: clean(params) });
export const listAttendanceApprovals = (params) => api.get("/hr/attendance/approvals", { params: clean(params) });

// ── shift assignments (My Attendance plan step 6: who works which shift over which period) ──────────────────────────
export const listShiftAssignments = (params) => api.get("/hr/attendance/shift-assignments", { params: clean(params) });
export const assignShift = (body) => api.post("/hr/attendance/shift-assignments", body);
export const endShiftAssignment = ({ id, effective_to }) => api.post(`/hr/attendance/shift-assignments/${id}/end`, { effective_to });
