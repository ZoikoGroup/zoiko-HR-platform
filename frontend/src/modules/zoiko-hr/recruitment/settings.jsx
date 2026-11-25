/*
 * Recruitment → Settings (HR and organisation admins): the recruitment privacy settings — privacy contact, candidate data
 * retention, talent-pool opt-in, CV-parsing notice, the confirmation when offer conditions clear, and offer letters without
 * approval. They used to open from a "Privacy settings" button on Candidates (QA bug 9 moved them here).
 */
import { RecruitmentLayout } from "./ui";
import RecruitmentPrivacySettings from "./PrivacySettings";

export default function RecruitmentSettings() {
  return (
    <RecruitmentLayout title="Recruitment Settings" breadcrumbTitle="Settings"
      subtitle="Candidate privacy, data retention and how offer letters are approved.">
      <div className="mx-auto max-w-4xl">
        <RecruitmentPrivacySettings embedded />
      </div>
    </RecruitmentLayout>
  );
}
