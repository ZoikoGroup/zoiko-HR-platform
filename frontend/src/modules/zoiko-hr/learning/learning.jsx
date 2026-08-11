import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HRPage from "../../../components/HRPage";

import LearningDashboard from "./dashboard.jsx";
import LearningCourses from "./courses.jsx";
import LearningAssessments from "./assessments.jsx";
import LearningTrainingPrograms from "./training-programs.jsx";
import LearningReports from "./reports.jsx";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "courses", label: "Courses" },
  { key: "assessments", label: "Assessments" },
  { key: "training-programs", label: "Training Programs" },
  { key: "reports", label: "Reports" },
];

export default function Learning() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    // location.pathname is typically "/zoiko-hr/learning/courses" -> parts: ["zoiko-hr", "learning", "courses"]
    return parts[2] || "dashboard";
  }, [location.pathname]);

  const handleTabChange = (key) => {
    if (key === "dashboard") {
      navigate("/zoiko-hr/learning");
    } else {
      navigate(`/zoiko-hr/learning/${key}`);
    }
  };

  return (
    <HRPage title="Learning & Development" subtitle="Course catalog, training programs, assessments, and reports.">


      <div className="mt-4">
        {activeTab === "dashboard" && <LearningDashboard isTab={true} />}
        {activeTab === "courses" && <LearningCourses isTab={true} />}
        {activeTab === "assessments" && <LearningAssessments isTab={true} />}
        {activeTab === "training-programs" && <LearningTrainingPrograms isTab={true} />}
        {activeTab === "reports" && <LearningReports isTab={true} />}
      </div>
    </HRPage>
  );
}
