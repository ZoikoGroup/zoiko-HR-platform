import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { BookOpen, CheckCircle, Clock, Award, Search, Loader2, AlertCircle } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getCourses } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function EssLearning() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCourses()
      .then(res => {
        const data = Array.isArray(res) ? res : res?.data || res?.items || [];
        setCourses(data);
      })
      .catch(err => setError(err?.message || "Failed to load courses"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter(c =>
    !search || (c.title || c.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const total = courses.length;
  const completed = courses.filter(c => c.completion_status === "completed").length;

  return (
    <HRPage title="Employee Self Service" subtitle="Access learning courses and track progress">
      <SubNav />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Learning</h1>
            <p className="text-sm text-gray-500 mt-1">Browse courses and track your learning progress</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{total}</p>
              <p className="text-xs text-gray-500">Total Courses</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completed}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50">
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{total - completed}</p>
              <p className="text-xs text-gray-500">In Progress</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm font-medium">Loading courses...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-semibold">
            <AlertCircle size={16} /> {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-700 mb-1">
              {search ? "No results found" : "No courses available"}
            </p>
            <p className="text-sm text-gray-400">
              {search ? "Try a different search term." : "Courses will appear here once they are published."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(course => (
              <div key={course.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2.5 rounded-lg ${course.completion_status === "completed" ? "bg-emerald-50" : "bg-indigo-50"}`}>
                    <BookOpen className={`w-5 h-5 ${course.completion_status === "completed" ? "text-emerald-600" : "text-indigo-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{course.title || course.name}</p>
                    {course.department && (
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{course.department}</p>
                    )}
                  </div>
                </div>
                {course.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{course.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {course.duration && <span>{course.duration}</span>}
                  {course.modules_count && <span>· {course.modules_count} modules</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HRPage>
  );
}