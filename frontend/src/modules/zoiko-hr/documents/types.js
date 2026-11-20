/**
 * Shared vocabularies and shapes of the documents module (docs/new_docs/ZHR-DOCS-ARCH-001 §9.5).
 * Plain JS with JSDoc (the codebase has no TypeScript build); the values mirror the backend enums exactly.
 */

export const DocumentStatus = Object.freeze({
  NOT_UPLOADED: "not_uploaded",
  PENDING: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  REUPLOAD_REQUESTED: "reupload_requested",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
});
export const EmployeeDocStatus = Object.freeze({ COMPLETE: "complete", PENDING: "pending", NEEDS_REVIEW: "needs_review", EXPIRED: "expired" });
export const AccessVisibility = Object.freeze({
  ADMIN_ONLY: "admin_only", ALL: "all_employees", DEPARTMENTS: "departments", ROLES: "roles", EMPLOYEES: "employees",
});
export const AccessPermission = Object.freeze({ VIEW: "view", DOWNLOAD: "download" });
export const ApprovalDecision = Object.freeze({ APPROVE: "approve", REJECT: "reject", REUPLOAD: "request_reupload" });
export const DocumentSource = Object.freeze({
  EMPLOYEE: "employee", COMPANY: "company", PAYROLL: "payroll", SYSTEM_ISSUE: "system_issue", TEMPLATE: "template",
  LEGACY_ADMIN: "legacy_admin",
});
export const PublishState = Object.freeze({ DRAFT: "draft", SCHEDULED: "scheduled", PUBLISHED: "published", UNPUBLISHED: "unpublished" });
export const RejectReason = Object.freeze({
  ILLEGIBLE: "illegible", WRONG_DOCUMENT: "wrong_document", EXPIRED: "expired", INCOMPLETE: "incomplete",
  NAME_MISMATCH: "name_mismatch", OTHER: "other",
});
export const ExpiryFilter = Object.freeze({ ALL: "all", EXPIRING_SOON: "expiring_soon", EXPIRED: "expired" });
export const ActionKind = Object.freeze({ ACKNOWLEDGE: "acknowledge", SIGN: "sign", REUPLOAD: "reupload", UPLOAD_REQUEST: "upload_request", REVIEW: "review" });
export const TaskKind = Object.freeze({
  UPLOAD_REQUIRED: "upload_required", REUPLOAD: "reupload", ACKNOWLEDGE: "acknowledge", REVIEW: "review", SIGN: "sign", RENEW: "renew",
});
export const PrecheckStatus = Object.freeze({ PASS: "pass", WARN: "warn", FAIL: "fail" });
export const RuleStatus = Object.freeze({ ACTIVE: "active", PAUSED: "paused", SHADOW: "shadow" });
export const RunStatus = Object.freeze({
  PENDING: "pending", RUNNING: "running", WAITING: "waiting", SUCCEEDED: "succeeded", FAILED: "failed", DEAD: "dead", SKIPPED: "skipped",
});

/** @typedef {{ id:number, name:string, employee_id_str:string, avatar_url?:string, department?:string, designation?:string, joined_on?:string }} EmployeeLite */
/** @typedef {{ approved:number, required:number, pending:number, rejected:number, expired:number, percent:number }} CompletionSummary */
/** @typedef {EmployeeLite & { completion:CompletionSummary, status:string }} EmployeeDocSummary */
/** @typedef {{ id:number, key:string, name:string, is_required:boolean, uploader:string, file_count:number, status:string, latest_file?:EmployeeFile }} CategoryContainer */
/** @typedef {{ status:string, checks:{code:string,status:string,message:string}[], ran_at:string }} Precheck */
/** @typedef {{ id:number, title:string, file_name:string, mime_type:string, size:number, version:number, version_id:number,
 *   status:string, uploaded_at:string, expiry_date?:string, rejection_reason?:string, reason_code?:string,
 *   decided_by?:{name:string,role:string}, decided_at?:string, source:string, precheck?:Precheck }} EmployeeFile */
/** @typedef {{ visibility:string, department_ids?:number[], roles?:string[], employee_ids?:number[], permission:'view'|'download', require_ack:boolean, inherit?:boolean }} AccessRule */
/** @typedef {{ visibility:string, audience_count?:number, label:string }} AccessSummary */
/** @typedef {EmployeeFile & { category_key:string, folder_id?:number, access:AccessSummary, publish_state:string, publish_at?:string,
 *   uploaded_by:{name:string}, ack?:{acknowledged:number,pending:number} }} CompanyFile */
/** @typedef {{ document_id:number, version_id:number, title:string, category_key:string, category_name:string, source:string,
 *   employee?:EmployeeLite, uploaded_by:{id:number,name:string}, submitted_at:string, waiting_days:number, sla_breached:boolean,
 *   status:string, precheck?:Precheck, steps:{role:string,status:string,by?:string,at?:string}[],
 *   lock?:{by:string,until:string}, can_decide:boolean, cannot_decide_reason?:'self'|'subject'|'locked'|'role' }} ApprovalItem */
/** @typedef {{ id:number, at:string, actor_type:'user'|'system'|'automation', actor?:{name:string,role:string}, rule?:{id:number,name:string},
 *   action:string, target:string, document_title?:string, employee?:EmployeeLite, ip?:string, before?:object, after?:object }} AuditRow */
/** @typedef {{ kind:string, title:string, due_by?:string, overdue:boolean, link:string, source:'generated'|'task', id:number }} ActionItem */
/** @typedef {{ after_days:number, action:'notify', to:'assignee'|'manager'|'hr_admins'|'org_admins', channels:string[], mark_overdue?:boolean }} LadderStep */
