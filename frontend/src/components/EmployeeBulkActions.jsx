import { useState, useRef } from "react";
import { Upload, Download, FileDown, X, CircleCheck, CircleAlert, Loader2 } from "lucide-react";
import { importEmployees } from "../service/employee";

const COLUMNS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "password", label: "Password", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "job_title", label: "Job Title", required: true },
  { key: "department", label: "Department", required: true },
  { key: "designation", label: "Designation", required: false },
  { key: "reporting_manager", label: "Reporting Manager", required: false },
  { key: "employment_type", label: "Employment Type", required: true },
  { key: "status", label: "Status", required: true },
  { key: "date_of_joining", label: "Date of Joining", required: true },
  { key: "date_of_birth", label: "Date of Birth", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "basic_salary", label: "Basic Salary", required: false },
  { key: "ctc", label: "CTC", required: false },
  { key: "work_email", label: "Work Email", required: false },
  { key: "personal_email", label: "Personal Email", required: false },
  { key: "confirmation_date", label: "Confirmation Date", required: false },
  { key: "company", label: "Company", required: false },
  { key: "business_unit", label: "Business Unit", required: false },
  { key: "division", label: "Division", required: false },
  { key: "team", label: "Team", required: false },
  { key: "current_address", label: "Current Address", required: false },
  { key: "permanent_address", label: "Permanent Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "country", label: "Country", required: false },
  { key: "pincode", label: "Pincode", required: false },
  { key: "address", label: "Address", required: false },
];

function toCSV(rows) {
  const header = COLUMNS.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    COLUMNS.map((c) => {
      const val = String(row[c.key] ?? "");
      return val.includes(",") || val.includes('"')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

function downloadFile(content, filename, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function EmployeeBulkActions({ employees = [], onImport }) {
  const fileInputRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function handleDownloadTemplate() {
    try {
      const { getAccessToken, API_BASE_URL } = await import("../service/api");
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/hr/employee-management/employees/import/template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to download import template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "employee-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Template download failed:", e.message);
    }
  }

  function handleExport() {
    if (employees.length === 0) return;
    const exportRows = employees.map((e) => ({
      first_name: e.firstName || e.first_name || "",
      last_name: e.lastName || e.last_name || "",
      email: e.email || "",
      phone: e.phone || "",
      job_title: e.jobTitle || e.job_title || "",
      department: e.departmentName || e.department?.name || "",
      designation: e.designationName || e.designation?.title || "",
      reporting_manager: e.reportingManagerName || "",
      employment_type: (e.employmentType || e.employment_type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      status: (e.status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      date_of_joining: e.dateOfJoining || e.date_of_joining || "",
      date_of_birth: e.dateOfBirth || e.date_of_birth || "",
      gender: e.gender || "",
      basic_salary: e.basicSalary || e.basic_salary || "",
      ctc: e.ctc || "",
      work_email: e.workEmail || e.work_email || "",
      personal_email: e.personalEmail || e.personal_email || "",
      confirmation_date: e.confirmationDate || e.confirmation_date || "",
      company: e.company || "",
      business_unit: e.businessUnit || e.business_unit || "",
      division: e.division || "",
      team: e.team || "",
      current_address: e.currentAddress || e.current_address || "",
      permanent_address: e.permanentAddress || e.permanent_address || "",
      city: e.city || "",
      state: e.state || "",
      country: e.country || "",
      pincode: e.pincode || "",
      address: e.address || "",
    }));
    downloadFile(toCSV(exportRows), `employees_export_${Date.now()}.csv`);
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImportResult(null);
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importEmployees(selectedFile);
      setImportResult(result);
      if (result.created > 0) {
        await onImport?.();
      }
    } catch (err) {
      setImportResult({
        total_rows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [{ row: 0, employee_id: "", email: "", field: "file", error: err.message || "Import failed" }],
      });
    } finally {
      setImporting(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedFile(null);
    setImportResult(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <FileDown className="h-4 w-4 text-gray-400" />
          Download template
        </button>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-4 w-4 text-gray-400" />
          Import employees
        </button>
        <button
          onClick={handleExport}
          disabled={employees.length === 0}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="h-4 w-4 text-gray-400" />
          Export CSV
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                Import employees
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-gray-500">
                Upload an Excel or CSV file matching the{" "}
                <button
                  onClick={handleDownloadTemplate}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  import template
                </button>
                . Required columns:{" "}
                {COLUMNS.filter((c) => c.required)
                  .map((c) => c.label)
                  .join(", ")}
                . If Password is left blank, a temporary password is auto-generated for each employee.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-6 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {selectedFile ? selectedFile.name : "Choose an Excel or CSV file"}
              </button>

              {selectedFile && !importResult && !importing && (
                <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-700">
                  <span className="font-medium">{selectedFile.name}</span> selected
                </div>
              )}

              {importing && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing employees...
                </div>
              )}

              {importResult && (
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  {importResult.errors.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CircleCheck className="h-4 w-4" />
                      {importResult.created} employee{importResult.created !== 1 ? "s" : ""}{" "}
                      created successfully.
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-red-700">
                        <CircleAlert className="h-4 w-4" />
                        {importResult.created > 0 && (
                          <span className="text-emerald-700">
                            {importResult.created} created.{" "}
                          </span>
                        )}
                        {importResult.errors.length} issue
                        {importResult.errors.length !== 1 ? "s" : ""} found
                      </div>
                      <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
                        {importResult.errors.slice(0, 20).map((err, i) => (
                          <li key={i}>
                            {err.row ? `Row ${err.row}: ` : ""}
                            {err.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {importResult ? "Close" : "Cancel"}
              </button>
              {!importResult && (
                <button
                  onClick={handleConfirmImport}
                  disabled={!selectedFile || importing}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {importing ? "Importing..." : "Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
