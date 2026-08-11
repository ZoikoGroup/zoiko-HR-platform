import { useState } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";

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

const mockProfileData = {
  name: "John Doe",
  email: "john.doe@company.com",
  phone: "+1 (555) 123-4567",
  address: "123 Main St, New York, NY 10001",
  workEmail: "john.doe@company.com",
  workPhone: "+1 (555) 987-6543",
  jobTitle: "Senior Software Engineer",
  employeeId: "ZO0001",
  joinDate: "2020-03-15",
  department: "Engineering",
  bloodGroup: "O+",
  manager: "Jane Smith",
  emergencyContacts: [
    { id: 1, name: "Jane Doe", relationship: "Spouse", phone: "+1 (555) 222-3333", email: "jane.doe@email.com" },
    { id: 2, name: "Bob Johnson", relationship: "Father", phone: "+1 (555) 444-5555", email: "bob.j@email.com" },
  ],
};

export default function EssProfile() {
  const [profile] = useState(mockProfileData);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({});

  const initForm = () => ({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    workEmail: profile.workEmail,
    workPhone: profile.workPhone,
  });

  const handleEdit = () => {
    setForm(initForm());
    setEditing(true);
    setMessage(null);
  };

  const handleCancel = () => {
    setEditing(false);
    setMessage(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      setMessage({ type: "success", text: "Profile updated successfully." });
      setEditing(false);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <HRPage title="Employee Self Service" subtitle="View and manage your personal information">
      <SubNav />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <p className="text-sm text-gray-500 mt-1">View and manage your personal information</p>
          </div>
          {!editing ? (
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.8 11.8l-5.3-5.3a2 2 0 00-2.8 0L5 15.6V19h3.4l8.4-8.4a2 2 0 000-2.8z" />
              </svg>
              Edit Profile
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          )}
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-lg flex justify-between items-center ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="font-bold">
              &times;
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
            <p className="text-sm text-gray-500">{profile.designation}</p>
            <p className="text-xs text-gray-400 mt-1">{profile.department}</p>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-500">
              <p>
                Employee ID: <span className="font-medium text-gray-800">{profile.employeeId}</span>
              </p>
              <p>
                Joined: <span className="font-medium text-gray-800">{profile.joinDate}</span>
              </p>
              <p>
                Manager: <span className="font-medium text-gray-800">{profile.manager}</span>
              </p>
              <p>
                Blood Group: <span className="font-medium text-gray-800">{profile.bloodGroup}</span>
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h3>
              {editing ? (
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
                      <input
                        type="email"
                        value={form.workEmail}
                        onChange={(e) => setForm({ ...form, workEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Work Phone</label>
                      <input
                        type="text"
                        value={form.workPhone}
                        onChange={(e) => setForm({ ...form, workPhone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <textarea
                        rows={2}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8" />
                      </svg>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Full Name</span>
                    <span className="text-gray-800 font-medium">{profile.name}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Email</span>
                    <span className="text-gray-800">{profile.email}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Phone</span>
                    <span className="text-gray-800">{profile.phone}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Work Email</span>
                    <span className="text-gray-800">{profile.workEmail}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Work Phone</span>
                    <span className="text-gray-800">{profile.workPhone || "-"}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Address</span>
                    <span className="text-gray-800">{profile.address}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Employee Code</span>
                    <span className="text-gray-800 font-mono">{profile.employeeId}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase block">Department</span>
                    <span className="text-gray-800">{profile.department}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5-4h.01M9 17l4-4 4 4m-4-4v12" />
                </svg>
                Work Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase block">Department</span>
                  <span className="text-gray-800">{profile.department}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase block">Designation</span>
                  <span className="text-gray-800">{profile.designation}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase block">Manager</span>
                  <span className="text-gray-800">{profile.manager}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase block">Join Date</span>
                  <span className="text-gray-800">{profile.joinDate}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 00.951.684h8.81a1 1 0 01.951.684l1.498 4.493a1 1 0 01-.574 1.416l-9.8 2.62a1 1 0 01-1.342-.316L5.55 8.02z" />
                </svg>
                Emergency Contacts
              </h3>
              <div className="space-y-3">
                {profile.emergencyContacts.map((ec) => (
                  <div key={ec.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ec.name}</p>
                      <p className="text-xs text-gray-500">{ec.relationship}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-700">{ec.phone}</p>
                      <p className="text-xs text-gray-500">{ec.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
