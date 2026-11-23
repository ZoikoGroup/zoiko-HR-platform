import { useCallback, useEffect, useRef, useState } from "react";
import { getCourses, getTrainingPrograms, getAssessments, getQuizAttempts, getMyProfile } from "../../../../service/employee";
import { departmentName, forMyDepartment, groupAssessmentsByCourse } from "../../../../utils/employeeLearning";
import { fetchAllPages } from "../../../../utils/learningPaging";
import { getEnrollments, createEnrollment } from "../../../../service/hrService";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data?.items || r?.data || []);

// Everything the employee Learning tabs need, loaded once and shared, so switching tabs does not
// refetch. Courses and programs are narrowed to the person's department (plus items for everyone).
export default function useLearnerLearning() {
  const [profile, setProfile] = useState(null);
  const [department, setDepartment] = useState("");
  const [courses, setCourses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [assessmentsByCourse, setAssessmentsByCourse] = useState({});
  const [attemptsByAssessment, setAttemptsByAssessment] = useState({});
  const [enrollmentsByCourse, setEnrollmentsByCourse] = useState({});        // { [course_id]: my enrollment }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const mounted = useRef(true);

  const loadAttempts = useCallback(async (assessments, employeeId) => {
    const map = {};
    await Promise.all((assessments || []).map(async (a) => {
      try { map[a.id] = asList(await getQuizAttempts(a.id, employeeId)); } catch { map[a.id] = []; }
    }));
    return map;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const profileRes = await getMyProfile();
      const me = profileRes?.data || profileRes || {};
      if (!mounted.current) return;
      const dept = departmentName(me);
      setProfile(me);
      setDepartment(dept);

      const [coursesRes, programsRes, assessmentsRes, enrollmentsRes] = await Promise.allSettled([
        fetchAllPages(getCourses),                 // every page: the catalogue used to stop at the first 100 (audit L9)
        fetchAllPages(getTrainingPrograms),
        getAssessments(),
        me.id != null ? fetchAllPages(getEnrollments, { employee_id: me.id }) : Promise.resolve([]),
      ]);
      if (coursesRes.status === "rejected") throw coursesRes.reason;

      const myCourses = forMyDepartment(asList(coursesRes.value), dept);
      const myPrograms = programsRes.status === "fulfilled" ? forMyDepartment(asList(programsRes.value), dept) : [];
      const courseIds = new Set(myCourses.map((c) => c.id));
      const myAssessments = assessmentsRes.status === "fulfilled"
        ? asList(assessmentsRes.value).filter((a) => courseIds.has(a.course_id))
        : [];
      const attempts = await loadAttempts(myAssessments, me.id ?? null);
      if (!mounted.current) return;

      setCourses(myCourses);
      setPrograms(myPrograms);
      setAssessmentsByCourse(groupAssessmentsByCourse(myAssessments));
      setAttemptsByAssessment(attempts);
      const mine = {};
      (enrollmentsRes.status === "fulfilled" ? asList(enrollmentsRes.value) : [])
        .filter((e) => me.id == null || e.employee_id === me.id)
        .forEach((e) => { mine[e.course_id] = e; });
      setEnrollmentsByCourse(mine);
      if (programsRes.status === "rejected" || assessmentsRes.status === "rejected") {
        setNotice("Some learning details could not be loaded. Refresh to try again.");
      }
    } catch (err) {
      if (mounted.current) setError(err?.message || "Failed to load learning data");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [loadAttempts]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const refreshAttempts = useCallback(async () => {
    const all = Object.values(assessmentsByCourse).flat();
    const fresh = await loadAttempts(all, profile?.id ?? null);
    if (mounted.current) setAttemptsByAssessment(fresh);
    // a submitted quiz moves the course's progress (the server recalculates it): read my enrollments again
    if (profile?.id != null) {
      try {
        const mine = {};
        asList(await fetchAllPages(getEnrollments, { employee_id: profile.id }))
          .filter((e) => e.employee_id === profile.id)
          .forEach((e) => { mine[e.course_id] = e; });
        if (mounted.current) setEnrollmentsByCourse(mine);
      } catch {
        // keep what is shown; the next full load reads them again
      }
    }
  }, [assessmentsByCourse, profile, loadAttempts]);

  /** Enroll the signed-in person in a course from the catalogue (the API enrolls a learner only themselves, only in an
   * active course, and only once). Throws with the server's message so the course card can show it. */
  const enroll = useCallback(async (course) => {
    const created = await createEnrollment(course.id, profile?.id ?? null);
    if (mounted.current) setEnrollmentsByCourse((prev) => ({ ...prev, [course.id]: created || { course_id: course.id, status: "enrolled" } }));
    return created;
  }, [profile]);

  return {
    profile,
    enrollmentsByCourse,
    enroll,
    employeeId: profile?.id ?? null,
    department,
    courses,
    programs,
    assessmentsByCourse,
    attemptsByAssessment,
    loading,
    error,
    notice,
    refresh: load,
    refreshAttempts,
  };
}
