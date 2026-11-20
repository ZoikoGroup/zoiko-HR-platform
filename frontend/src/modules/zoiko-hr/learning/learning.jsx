import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getStoredUser } from "../../../service/api";
import { activeLearningTab, learningTabHref, learningTabsFor } from "../../../utils/learningAccess";

import LearningDashboard from "./dashboard.jsx";
import LearningCourses from "./courses.jsx";
import LearningAssessments from "./assessments.jsx";
import LearningTrainingPrograms from "./training-programs.jsx";
import LearningReports from "./reports.jsx";
import LearningEnrollments from "./enrollments.jsx";
import LearningCertifications from "./certifications.jsx";
import LearningSkills from "./skills.jsx";

const PAGES = {
  dashboard: LearningDashboard,
  courses: LearningCourses,
  enrollments: LearningEnrollments,
  "training-programs": LearningTrainingPrograms,
  assessments: LearningAssessments,
  certifications: LearningCertifications,
  skills: LearningSkills,
  reports: LearningReports,
};

function storedUser() {
  try { return getStoredUser(); } catch { return null; }
}

/**
 * Learning & Development with a tab bar to every sub-page (audit L16). HR Admin and Org Admin see every tab; anyone else
 * (a manager) gets no link to the admin-only dashboard, reports or record screens. The HR Admin portal has a single route
 * (/hr-admin/learning), so its tabs are kept in ?tab=.
 */
export default function Learning() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useMemo(() => learningTabsFor(storedUser()), []);
  const activeTab = activeLearningTab(location.pathname, location.search, tabs);
  const Page = PAGES[activeTab];

  return (
    <HRPage title="Learning & Development" subtitle="Course catalog, enrollments, training programs, assessments, certifications, skills and reports.">
      <nav aria-label="Learning sections" className="border-b border-gray-200 dark:border-[#334155]">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => navigate(learningTabHref(location.pathname, t.key))}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-[#94a3b8] hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mt-4">{Page && <Page isTab />}</div>
    </HRPage>
  );
}
