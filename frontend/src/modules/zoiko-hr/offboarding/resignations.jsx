/* Resignations: exits waiting for a decision (resignations, exits needing a second approver, contracts ending) and
   withdrawal requests from people whose resignation was already accepted. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileSignature, RotateCcw, XCircle } from "lucide-react";
import { approveExit, decideWithdrawal, getResignationsInbox, rejectExit } from "../../../service/offboardingService";
import { formatDateTime } from "../../../utils/dateTime";
import { Card, EmptyState, PersonCell, PrimaryButton, SecondaryButton, shortDate } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { ApproveDialog, ConfirmDialog, ErrorBanner, ExitTypePill, Loading, Notice, REASON_CATEGORIES, labelOf, useLoad } from "./shared";

function Facts({ c }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-gray-500">Notice given</dt><dd className="font-medium">{shortDate(c.resignation_date)}</dd></div>
      <div><dt className="text-xs text-gray-500">Notice ends</dt><dd className="font-medium">{shortDate(c.notice_end_date)}</dd></div>
      <div><dt className="text-xs text-gray-500">Asked for last day</dt><dd className="font-medium">{c.requested_last_day ? shortDate(c.requested_last_day) : "—"}</dd></div>
      <div><dt className="text-xs text-gray-500">Proposed last day</dt><dd className="font-medium">{shortDate(c.last_working_day)}</dd></div>
    </dl>
  );
}

export default function OffboardingResignations() {
  const inbox = useLoad(() => getResignationsInbox(), []);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [withdrawal, setWithdrawal] = useState(null);   // {case, accept}
  const [ok, setOk] = useState("");
  const pending = inbox.data?.pending || [];
  const withdrawals = inbox.data?.withdrawals || [];
  const done = async (message) => { setOk(message); await inbox.reload(); };
  return (
    <OffboardingLayout title="Resignations" subtitle="Resignations and exits waiting for a decision, and requests to withdraw."
      counts={{ Resignations: pending.length + withdrawals.length }}>
      <div className="space-y-6">
        <ErrorBanner message={inbox.error} />
        <Notice message={ok} onClose={() => setOk("")} />
        <Card title={`Waiting for a decision (${pending.length})`} bodyClass="p-0 pt-3">
          {inbox.loading && !inbox.data ? <Loading /> : pending.length === 0 ? (
            <EmptyState icon={FileSignature} title="Nothing to decide">New resignations appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pending.map((c) => (
                <li key={c.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[220px] flex-1">
                      <PersonCell name={c.employee?.name} sub={[c.employee?.job_title, c.employee?.department].filter(Boolean).join(" · ")} />
                    </div>
                    <ExitTypePill type={c.exit_type} label={c.exit_type_label} />
                    <span className="text-xs text-gray-500">Submitted {formatDateTime(c.created_at)}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-gray-900">{labelOf(REASON_CATEGORIES, c.reason_category)}</p>
                    {c.reason && <p className="mt-1 whitespace-pre-line text-gray-700">{c.reason}</p>}
                  </div>
                  <Facts c={c} />
                  <div className="flex flex-wrap gap-2">
                    {c.can_decide ? <>
                      <PrimaryButton icon={CheckCircle2} onClick={() => setApproving(c)} aria-label={`Approve exit of ${c.employee?.name}`}>Approve</PrimaryButton>
                      <SecondaryButton icon={XCircle} onClick={() => setRejecting(c)} aria-label={`Reject exit of ${c.employee?.name}`}>Reject</SecondaryButton>
                    </> : <p className="text-sm text-gray-500">Another approver must decide this one.</p>}
                    <Link to={`/zoiko-hr/offboarding/cases/${c.id}`} className="inline-flex items-center px-2 text-sm font-medium text-blue-700 hover:underline">Open case</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Withdrawal requests (${withdrawals.length})`} bodyClass="p-0 pt-3">
          {inbox.loading && !inbox.data ? <Loading /> : withdrawals.length === 0 ? (
            <EmptyState icon={RotateCcw} title="No withdrawal requests">When someone asks to take back an accepted resignation, it appears here.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {withdrawals.map((c) => (
                <li key={c.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[220px] flex-1"><PersonCell name={c.employee?.name} sub={c.case_number} /></div>
                    <span className="text-xs text-gray-500">Asked {formatDateTime(c.withdrawal_requested_at)} · last day {shortDate(c.last_working_day)}</span>
                  </div>
                  {c.withdrawal_reason && <p className="rounded-xl bg-slate-50 p-3 text-sm text-gray-700">“{c.withdrawal_reason}”</p>}
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton onClick={() => setWithdrawal({ c, accept: true })} aria-label={`Accept withdrawal of ${c.employee?.name}`}>Accept withdrawal</PrimaryButton>
                    <SecondaryButton onClick={() => setWithdrawal({ c, accept: false })} aria-label={`Decline withdrawal of ${c.employee?.name}`}>Decline</SecondaryButton>
                    <Link to={`/zoiko-hr/offboarding/cases/${c.id}`} className="inline-flex items-center px-2 text-sm font-medium text-blue-700 hover:underline">Open case</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ApproveDialog open={Boolean(approving)} exitCase={approving} onClose={() => setApproving(null)}
        onApprove={async (body) => { const name = approving.employee?.name; await approveExit(approving.id, body); await done(`Approved the exit of ${name}.`); }} />
      <ConfirmDialog open={Boolean(rejecting)} title={`Reject the resignation of ${rejecting?.employee?.name || ""}`} confirmLabel="Reject" danger
        reasonLabel="Reason" reasonHint="The employee sees this." onClose={() => setRejecting(null)}
        onConfirm={async (note) => { const name = rejecting.employee?.name; await rejectExit(rejecting.id, note); await done(`Rejected the resignation of ${name}.`); }} />
      <ConfirmDialog open={Boolean(withdrawal)} danger={withdrawal ? !withdrawal.accept : false}
        title={withdrawal?.accept ? "Accept the withdrawal" : "Decline the withdrawal"}
        message={withdrawal?.accept ? "The exit stops: open tasks are cancelled and the employee stays." : "The exit continues as planned."}
        confirmLabel={withdrawal?.accept ? "Accept withdrawal" : "Decline"}
        reasonLabel={withdrawal?.accept ? "Note (optional)" : "Reason"} reasonRequired={!withdrawal?.accept}
        reasonHint={withdrawal?.accept ? undefined : "The employee sees this."} onClose={() => setWithdrawal(null)}
        onConfirm={async (note) => {
          const { c, accept } = withdrawal;
          await decideWithdrawal(c.id, accept, note);
          await done(accept ? `Withdrawal accepted: ${c.employee?.name} stays.` : "Withdrawal declined.");
        }} />
    </OffboardingLayout>
  );
}
