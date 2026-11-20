/**
 * Which cached queries a documents change makes stale (docs/new_docs/ZHR-DOCS-ARCH-001 §9.6). One place, so an approval
 * refreshes the employee's files, the queue and the counts everywhere at once.
 */
import { keys } from "../../../../service/queryKeys";

export function invalidateAfterMyUpload(qc) {
  qc.invalidateQueries({ queryKey: keys.documents.me.all });
}

export function invalidateAfterDecision(qc) {
  qc.invalidateQueries({ queryKey: keys.documents.approvals.all });
  qc.invalidateQueries({ queryKey: keys.documents.employees.all });
  qc.invalidateQueries({ queryKey: ["documents", "versions"] });
  qc.invalidateQueries({ queryKey: ["documents", "audit"] });
  qc.invalidateQueries({ queryKey: keys.documents.me.all });
}

export function invalidateAfterCompanyChange(qc) {
  qc.invalidateQueries({ queryKey: keys.documents.company.all });
  qc.invalidateQueries({ queryKey: ["documents", "access"] });
  qc.invalidateQueries({ queryKey: ["documents", "versions"] });
  qc.invalidateQueries({ queryKey: keys.documents.me.all });
}
