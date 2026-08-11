import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEmployeeById } from "../../../../service/employee";
import HRPage from "../../../../components/HRPage";
import { ArrowLeft, Mail, Phone, Calendar, MapPin, Building, Briefcase, DollarSign, User, Award } from "lucide-react";

const STATUS_STYLES = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-red-100 text-red-800",
  on_leave: "bg-yellow-100 text-yellow-800",
  terminated: "bg-gray-100 text-gray-800",
  resigned: "bg-orange-100 text-orange-800",
};

const EMPLOYMENT_TYPE_LABELS = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Intern",
  probation: "Probation",
};

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "employment", label: "Employment", icon: Briefcase },
];

function getInitials(first, last) {
  return `${(first || "")[0] || ""}${(last || "")[0] || ""}`.toUpperCase() || "?";
}

function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className="col-span-2 text-sm text-gray-900">{value || <span className="text-gray-400 italic">Not set</span>}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatBadge({ label, value }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

const _ = (e, snake, camel) => e?.[camel ?? snake] ?? e?.[snake] ?? null;

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const empResp = await getEmployeeById(id);
        if (!mounted) return;
        setEmployee(empResp);

        const mgrId = _(empResp, "reporting_manager_id", "reportingManagerId");
        if (mgrId) {
          getEmployeeById(mgrId).then((mgr) => {
            if (mounted) setManager(mgr);
          }).catch(() => {});
        }
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load employee");
      }
    };

    fetchData().finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return (
      <HRPage title="Employee Profile" subtitle="Loading employee details...">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </HRPage>
    );
  }

  if (error || !employee) {
    return (
      <HRPage title="Employee Profile" subtitle="Error loading profile">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 font-medium">{error || "Employee not found"}</p>
          <button onClick={() => navigate("/zoiko-hr/employee-management/employees")} className="mt-4 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            Back to Employees
          </button>
        </div>
      </HRPage>
    );
  }

  const firstName = _(employee, "first_name", "firstName");
  const lastName = _(employee, "last_name", "lastName");
  const employeeId = _(employee, "employee_id", "employeeId");
  const employeeCode = _(employee, "employee_code", "employeeCode");
  const jobTitle = _(employee, "job_title", "jobTitle");
  const email = _(employee, "email");
  const phone = _(employee, "phone");
  const status = _(employee, "status");
  const employmentType = _(employee, "employment_type", "employmentType");
  const dateOfJoining = _(employee, "date_of_joining", "dateOfJoining");
  const confirmationDate = _(employee, "confirmation_date", "confirmationDate");
  const dateOfBirth = _(employee, "date_of_birth", "dateOfBirth");
  const gender = _(employee, "gender");
  const workEmail = _(employee, "work_email", "workEmail");
  const personalEmail = _(employee, "personal_email", "personalEmail");
  const deptName = _(employee, "departmentName") || employee?.department?.name || null;
  const designationName = _(employee, "designationName") || employee?.designation?.title || null;
  const managerName = manager ? `${_(manager, "first_name", "firstName")} ${_(manager, "last_name", "lastName")}` : null;
  const basicSalary = _(employee, "basic_salary", "basicSalary");
  const ctc = _(employee, "ctc");
  const currentAddress = _(employee, "current_address", "currentAddress");
  const permanentAddress = _(employee, "permanent_address", "permanentAddress");
  const city = _(employee, "city");
  const state = _(employee, "state");
  const country = _(employee, "country");
  const pincode = _(employee, "pincode");
  const company = _(employee, "company");
  const businessUnit = _(employee, "business_unit", "businessUnit");
  const division = _(employee, "division");
  const team = _(employee, "team");
  const reportingManagerId = _(employee, "reporting_manager_id", "reportingManagerId");
  const managerEmail = manager ? _(manager, "email") : null;
  const managerPhone = manager ? _(manager, "phone") : null;

  return (
    <HRPage title={`${firstName} ${lastName}`} subtitle={`${employeeId} · Employee Code: ${employeeCode}`}>
      <div className="mb-4">
        <button onClick={() => navigate("/zoiko-hr/employee-management/employees")} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Employees
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold mx-auto">
              {getInitials(firstName, lastName)}
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-3">{firstName} {lastName}</h2>
            <p className="text-sm text-gray-500">{jobTitle}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || "bg-gray-100 text-gray-800"}`}>
                {(status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {EMPLOYMENT_TYPE_LABELS[employmentType] || employmentType}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Info</h3>
            <div className="flex items-start gap-3 text-sm">
              <User className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium font-mono">{employeeId}</p>
                <p className="text-gray-500 text-xs">Employee ID</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Building className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{deptName || "\u2014"}</p>
                <p className="text-gray-500 text-xs">Department</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Award className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{designationName || "\u2014"}</p>
                <p className="text-gray-500 text-xs">Designation</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <User className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{managerName || reportingManagerId || "\u2014"}</p>
                <p className="text-gray-500 text-xs">Reporting Manager</p>
              </div>
            </div>
              <div className="flex items-start gap-3 text-sm">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-gray-900 font-medium">{formatDate(dateOfJoining) || "\u2014"}</p>
                  <p className="text-gray-500 text-xs">Joined</p>
                </div>
              </div>
            <div className="flex items-start gap-3 text-sm">
              <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium break-all">{email}</p>
                <p className="text-gray-500 text-xs">Email</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{phone || "\u2014"}</p>
                <p className="text-gray-500 text-xs">Phone</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatBadge label="Salary" value={basicSalary ? `$${Number(basicSalary).toLocaleString()}` : "\u2014"} />
            <StatBadge label="CTC" value={ctc ? `$${Number(ctc).toLocaleString()}` : "\u2014"} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === tab.id
                        ? "text-blue-600 border-blue-600 bg-blue-50/50"
                        : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-4 space-y-4">
              {activeTab === "overview" && (
                <>
                  <SectionCard title="Personal Information" icon={User}>
                    <InfoRow label="First Name" value={firstName} />
                    <InfoRow label="Last Name" value={lastName} />
                    <InfoRow label="Email" value={email} />
                    <InfoRow label="Phone" value={phone} />
                    <InfoRow label="Work Email" value={workEmail} />
                    <InfoRow label="Personal Email" value={personalEmail} />
                    <InfoRow label="Date of Birth" value={formatDate(dateOfBirth)} />
                    <InfoRow label="Gender" value={gender} />
                  </SectionCard>

                  <SectionCard title="Address" icon={MapPin}>
                    <InfoRow label="Current Address" value={currentAddress} />
                    <InfoRow label="Permanent Address" value={permanentAddress} />
                    <InfoRow label="City" value={city} />
                    <InfoRow label="State" value={state} />
                    <InfoRow label="Country" value={country} />
                    <InfoRow label="Pincode" value={pincode} />
                  </SectionCard>

                  <SectionCard title="Organization" icon={Building}>
                    <InfoRow label="Company" value={company} />
                    <InfoRow label="Business Unit" value={businessUnit} />
                    <InfoRow label="Division" value={division} />
                    <InfoRow label="Team" value={team} />
                  </SectionCard>
                </>
              )}

              {activeTab === "employment" && (
                <>
                  <SectionCard title="Job Details" icon={Briefcase}>
                    <InfoRow label="Job Title" value={jobTitle} />
                    <InfoRow label="Department" value={deptName} />
                    <InfoRow label="Designation" value={designationName} />
                    <InfoRow label="Employment Type" value={EMPLOYMENT_TYPE_LABELS[employmentType] || employmentType} />
                    <InfoRow label="Status" value={(status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />
                  </SectionCard>

                  <SectionCard title="Dates" icon={Calendar}>
                    <InfoRow label="Date of Joining" value={formatDate(dateOfJoining)} />
                    <InfoRow label="Confirmation Date" value={formatDate(confirmationDate)} />
                    <InfoRow label="Created At" value={formatDate(employee?.created_at || employee?.createdAt)} />
                  </SectionCard>

                  <SectionCard title="Reporting" icon={User}>
                    <InfoRow label="Reporting Manager" value={managerName || (reportingManagerId ? `ID: ${reportingManagerId}` : null)} />
                    <InfoRow label="Manager Email" value={managerEmail} />
                    <InfoRow label="Manager Phone" value={managerPhone} />
                  </SectionCard>

                  <SectionCard title="Compensation" icon={DollarSign}>
                    <InfoRow label="Basic Salary" value={basicSalary ? `$${Number(basicSalary).toLocaleString()}` : null} />
                    <InfoRow label="CTC" value={ctc ? `$${Number(ctc).toLocaleString()}` : null} />
                  </SectionCard>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
