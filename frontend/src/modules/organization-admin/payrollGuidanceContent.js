// Static reference content for the "Payroll Guidance" page.
// Pure data — no API calls, no computation, no live payroll/employee/tax figures.
// Every name, number, and scenario below is fictional sample data for illustration only.

export const SAMPLE_DISCLAIMER =
  "Sample Data — for illustration only. Not connected to your organization's real records.";

export const GUIDANCE_STEPS = [
  // ── Step 1 ─────────────────────────────────────────────────────────
  {
    id: "welcome",
    number: 1,
    title: "Welcome to Payroll",
    icon: "Sparkles",
    summary: "What the Payroll module is, its features, and the end-to-end workflow.",
    content: [
      { type: "p", text: "Zoiko Payroll is the module that runs your organization's entire pay cycle — from setting up compliance rules to calculating salaries, generating payslips, and producing statutory reports. It's built for multi-country, multi-tenant use, so every organization on the platform configures its own currency, jurisdiction, and pay rules independently." },
      { type: "h", text: "What the Payroll module does" },
      { type: "list", items: [
        "Stores your organization's payroll policy, compliance profile, and salary structures.",
        "Maintains a payroll-specific employee master (separate from your core HR employee records) with salary, bank, and tax details.",
        "Tracks attendance and leave that feed directly into salary calculations.",
        "Runs payroll for a period, calculating gross pay, deductions, employer contributions, and net pay per employee.",
        "Generates payslips and statutory reports, and produces a bank transfer file for disbursement.",
      ]},
      { type: "h", text: "Key benefits" },
      { type: "list", items: [
        "One system for policy, compliance, employees, attendance, leave, and payroll — no spreadsheets.",
        "Country-aware calculations (tax slabs, statutory contributions) instead of hardcoded formulas.",
        "Full audit trail: every run moves through Draft → Review → Approved → Authorized → Paid → Closed.",
        "Payslips and reports available in multiple export formats (PDF, CSV, TXT, XLSX).",
      ]},
      { type: "h", text: "Supported countries" },
      { type: "p", text: "Standard calculations are available for India, the United States, and the United Kingdom out of the box. Additional jurisdictions can be configured under Enterprise mode as your organization expands." },
      { type: "flow", title: "Payroll workflow overview", steps: [
        "Organization Setup", "Compliance Setup", "Employee Setup", "Attendance & Leave", "Payroll Run", "Approval", "Payslips & Reports",
      ]},
      { type: "callout", tone: "tip", title: "Where to start", text: "If this is a brand-new organization, work through this guide in order — each step builds on the one before it (you can't run payroll before employees and attendance exist, for example)." },
    ],
  },

  // ── Step 2 ─────────────────────────────────────────────────────────
  {
    id: "organization-setup",
    number: 2,
    title: "Organization Setup",
    icon: "Building2",
    summary: "Organization details, financial year, currency, time zone, and cycle basics.",
    content: [
      { type: "p", text: "Before configuring payroll rules, confirm your organization's core profile is correct — Payroll reads from it for currency formatting, statutory defaults, and reporting periods." },
      { type: "h", text: "Organization Details" },
      { type: "list", items: [
        "Legal name, registered address, and registration/tax numbers — used on payslips and compliance filings.",
        "Country — determines which statutory rules (tax slabs, contribution types) apply by default.",
      ]},
      { type: "h", text: "Financial Year" },
      { type: "p", text: "Your financial year determines how annual tax slabs and yearly reports are bucketed. India typically runs April–March; the US and UK often run on a calendar or April–April basis depending on filing requirements." },
      { type: "h", text: "Currency" },
      { type: "p", text: "Set once at organization level and used consistently across payslips, reports, and dashboards. Changing currency after payroll history exists does not retroactively convert past figures — it only changes formatting going forward." },
      { type: "h", text: "Time Zone" },
      { type: "p", text: "Used for timestamping attendance check-ins and payroll run audit logs, particularly relevant for organizations with staff across regions." },
      { type: "h", text: "Payroll Settings: Cycle, Working Days & Weekends" },
      { type: "list", items: [
        "Payroll cycle — the recurring period payroll is calculated for (see Step 3 for frequency options).",
        "Working days — which weekdays count toward attendance and pro-rated pay.",
        "Weekends — excluded from working-day counts unless an employee is scheduled to work them.",
      ]},
      { type: "table", title: "Example — Organization Profile (Sample Data)", headers: ["Field", "Sample Value"], rows: [
        ["Legal Name", "Nimbus Retail Pvt Ltd"],
        ["Country", "India"],
        ["Currency", "INR (₹)"],
        ["Financial Year", "Apr 1 – Mar 31"],
        ["Time Zone", "Asia/Kolkata"],
      ]},
      { type: "callout", tone: "warning", title: "Get this right first", text: "Currency and country are read by every downstream calculation. Changing them mid-year after payroll runs exist can cause reporting inconsistencies — confirm them before your first run." },
    ],
  },

  // ── Step 3 ─────────────────────────────────────────────────────────
  {
    id: "payroll-configuration",
    number: 3,
    title: "Payroll Configuration",
    icon: "SlidersHorizontal",
    summary: "Payroll frequency options, the payroll calendar, and key cut-off dates.",
    content: [
      { type: "p", text: "Payroll frequency determines how often employees are paid and how each pay period's dates are calculated." },
      { type: "h", text: "Frequency options" },
      { type: "list", items: [
        "Monthly — one payroll run per calendar month (the most common setup).",
        "Weekly — a run every 7 days; typical for hourly/shift-based workforces.",
        "Semi-Monthly — two runs per month, usually split at mid-month and month-end.",
        "Bi-Weekly — a run every 14 days, common in North American payroll practice.",
      ]},
      { type: "h", text: "Payroll Calendar" },
      { type: "p", text: "Once frequency is set, the system derives each period's start and end dates automatically. Review the generated calendar before your first run to confirm period boundaries match your intended pay cycle." },
      { type: "h", text: "Salary Processing Date vs. Cut-Off Date" },
      { type: "list", items: [
        "Cut-off date — the last day attendance/leave changes for a period are accepted before payroll is calculated.",
        "Salary processing date — the date payroll is actually run and payslips are generated, typically a few days after the cut-off to allow for review.",
      ]},
      { type: "table", title: "Example — Monthly Cycle (Sample Data)", headers: ["Item", "Sample Date"], rows: [
        ["Pay Period", "1 – 30 Jun 2026"],
        ["Attendance Cut-Off", "28 Jun 2026"],
        ["Payroll Processing", "30 Jun 2026"],
        ["Pay Date", "1 Jul 2026"],
      ]},
      { type: "callout", tone: "tip", title: "Consistency matters", text: "Keep cut-off and pay dates consistent month over month — employees and finance both plan around a predictable schedule." },
    ],
  },

  // ── Step 4 ─────────────────────────────────────────────────────────
  {
    id: "jurisdiction",
    number: 4,
    title: "Jurisdiction Configuration",
    icon: "Globe",
    summary: "Country/state/province selection and why it drives your compliance rules.",
    content: [
      { type: "p", text: "Jurisdiction is the single most important setting in Payroll — it decides which statutory contributions, tax slabs, and compliance rules are applied to every calculation." },
      { type: "h", text: "What you configure" },
      { type: "list", items: [
        "Country — the primary driver of tax and contribution logic (e.g. India applies PF/ESI/PT/TDS; the US applies federal/state tax and FICA; the UK applies PAYE and National Insurance).",
        "State / Province — some countries have state-specific rules (e.g. Professional Tax slabs in India vary by state; US state income tax varies widely).",
        "Tax Region — used where a country's statutory rules are region-specific rather than fully national.",
      ]},
      { type: "h", text: "Why jurisdiction is important" },
      { type: "p", text: "Every payroll calculation — gross-up, statutory deduction, employer contribution, tax withholding — looks up rates keyed to the organization's configured jurisdiction. An incorrect jurisdiction produces incorrect payslips and non-compliant filings, so this should be one of the very first things you verify after registration." },
      { type: "callout", tone: "warning", title: "Set this before running payroll", text: "Changing jurisdiction after payroll runs already exist does not retroactively recalculate them. Confirm your country/state is correct during onboarding, before your first live run." },
      { type: "callout", tone: "info", title: "Multiple jurisdictions", text: "Organizations operating in more than one country can configure multiple jurisdictions under Enterprise mode, but only one jurisdiction is active for actual payroll runs at a time." },
    ],
  },

  // ── Step 5 ─────────────────────────────────────────────────────────
  {
    id: "compliance-setup",
    number: 5,
    title: "Compliance Setup",
    icon: "ShieldCheck",
    summary: "Statutory contributions and tax withholding, by country.",
    content: [
      { type: "p", text: "Compliance Setup is where your organization's statutory obligations are configured — the deductions and contributions required by law in your jurisdiction." },
      { type: "h", text: "India" },
      { type: "list", items: [
        "Income Tax / TDS (Tax Deducted at Source) — withheld from salary based on the employee's tax slab.",
        "PF (Provident Fund) — retirement savings contribution, shared between employer and employee.",
        "ESI (Employee State Insurance) — health/social security contribution for eligible wage bands.",
        "Professional Tax (PT) — a state-levied tax on salaried income; slabs vary by state.",
      ]},
      { type: "h", text: "United States" },
      { type: "list", items: [
        "Federal and state income tax withholding.",
        "Social Security and Medicare (FICA) — shared employer/employee contributions.",
      ]},
      { type: "h", text: "United Kingdom" },
      { type: "list", items: [
        "PAYE (Pay As You Earn) — income tax withheld at source.",
        "National Insurance — funds state benefits and pensions.",
      ]},
      { type: "h", text: "Other country-specific schemes you may encounter" },
      { type: "list", items: [
        "PAYG (Pay As You Go) — Australia's withholding tax system.",
        "Superannuation — Australia's mandatory retirement contribution.",
        "CPP (Canada Pension Plan) and EI (Employment Insurance) — Canada's statutory contributions.",
      ]},
      { type: "table", title: "Example — India Compliance Profile (Sample Data)", headers: ["Component", "Sample Rate"], rows: [
        ["Employee PF", "12% of Basic"],
        ["Employer PF", "12% of Basic"],
        ["ESI (Employee)", "0.75% of gross (if eligible)"],
        ["ESI (Employer)", "3.25% of gross (if eligible)"],
        ["Professional Tax", "State-slab based"],
      ]},
      { type: "callout", tone: "danger", title: "Keep this current", text: "Statutory rates change periodically (budget updates, slab revisions). Review your Compliance profile whenever a jurisdiction announces a rate change — running payroll on stale rates is a compliance risk, not just a display issue." },
    ],
  },

  // ── Step 6 ─────────────────────────────────────────────────────────
  {
    id: "salary-components",
    number: 6,
    title: "Salary Components",
    icon: "Layers",
    summary: "How CTC breaks down into earnings, contributions, and deductions.",
    content: [
      { type: "p", text: "A salary structure is a breakdown of an employee's Cost to Company (CTC) into individual components — each with its own tax treatment and calculation rule." },
      { type: "h", text: "Earnings" },
      { type: "list", items: [
        "Basic Salary — the foundation figure many other components (PF, HRA) are calculated as a percentage of.",
        "HRA (House Rent Allowance) — housing component, often tax-advantaged up to statutory limits.",
        "Allowances — fixed monthly amounts (transport, special allowance, etc.).",
        "Bonus / Commission — variable pay tied to performance or targets, usually processed separately from fixed monthly pay.",
        "Reimbursements — expense repayments, typically non-taxable up to submitted-and-approved amounts.",
      ]},
      { type: "h", text: "Contributions" },
      { type: "list", items: [
        "Employer Contributions — statutory amounts the organization pays on top of CTC (e.g. employer PF, employer ESI) — part of CTC but not paid directly to the employee.",
        "Employee Contributions — statutory amounts withheld from the employee's own pay (e.g. employee PF).",
      ]},
      { type: "h", text: "Deductions" },
      { type: "list", items: [
        "Statutory deductions (PF, ESI, PT, TDS) plus any voluntary deductions (loan recovery, etc.).",
      ]},
      { type: "h", text: "Putting it together: CTC → Gross → Net" },
      { type: "list", items: [
        "CTC — total annual cost to the company, including employer contributions.",
        "Gross Salary — CTC minus employer-side contributions; what appears as \"earnings\" on the payslip before deductions.",
        "Net Salary (Take-Home) — Gross Salary minus all deductions (statutory + voluntary). What the employee actually receives.",
      ]},
      { type: "table", title: "Example — Monthly Breakdown for a ₹14,00,000 CTC (Sample Data)", headers: ["Component", "Sample Monthly Amount"], rows: [
        ["Basic Salary", "₹58,333"],
        ["HRA", "₹23,333"],
        ["Special Allowance", "₹35,000"],
        ["Gross Salary", "₹1,16,666"],
        ["Employee PF (deduction)", "₹7,000"],
        ["Professional Tax (deduction)", "₹200"],
        ["TDS (deduction)", "varies by tax slab"],
        ["Net Salary (approx.)", "₹1,08,000 – ₹1,09,000"],
      ]},
      { type: "callout", tone: "tip", title: "Design salary structures once, reuse them", text: "Most organizations define a small number of standard salary structures (e.g. by grade/level) rather than customizing every employee individually — simpler to maintain and audit." },
    ],
  },

  // ── Step 7 ─────────────────────────────────────────────────────────
  {
    id: "payroll-policies",
    number: 7,
    title: "Payroll Policies",
    icon: "ClipboardList",
    summary: "Working hours, overtime, late policy, and how policy versioning works.",
    content: [
      { type: "p", text: "Payroll Policy is the rulebook payroll calculations follow — hours, attendance-related pay rules, and the salary structure template applied to employees under that policy." },
      { type: "h", text: "What a policy covers" },
      { type: "list", items: [
        "Working Hours — standard daily/weekly hours used to judge full-day vs. partial attendance.",
        "Overtime — rules for pay beyond standard hours (rate multiplier, eligibility).",
        "Late Policy — how late arrivals affect attendance/pay (grace periods, deductions).",
        "Holiday Policy — which days are paid holidays, and how they interact with attendance.",
        "Leave Policy — leave types, accrual, and how unpaid leave affects salary (see Step 10).",
        "Salary Structure — the earnings/deduction template applied under this policy.",
      ]},
      { type: "h", text: "Effective Date & Policy Versioning" },
      { type: "p", text: "Policies are versioned by effective date rather than edited in place — so a mid-year rate change doesn't silently rewrite history. Payroll runs for past periods keep using the policy version that was active during that period; only runs on or after a new version's effective date use the updated rules." },
      { type: "callout", tone: "info", title: "Standard vs. Enterprise", text: "Standard policy covers single-country payroll with the built-in calculation engine. Enterprise policy adds multi-jurisdiction configuration for organizations expanding into new countries — see the Compliance and Jurisdiction sections for how the two interact." },
      { type: "callout", tone: "warning", title: "Changing a live policy", text: "Avoid editing a policy that's already been used in an approved payroll run for the current period — create a new version with a future effective date instead, so historical runs remain accurate." },
    ],
  },

  // ── Step 8 ─────────────────────────────────────────────────────────
  {
    id: "employee-management",
    number: 8,
    title: "Employee Management",
    icon: "Users",
    summary: "Adding, importing, and updating employees, plus the details payroll needs per person.",
    content: [
      { type: "p", text: "The Employees sub-module holds Payroll's own employee master — salary, bank, tax, and compliance details needed to run payroll for each person." },
      { type: "h", text: "Adding employees" },
      { type: "list", items: [
        "Add Employee — for one-off additions, fill in the form directly.",
        "Import Employees — bulk-add many employees at once from a spreadsheet template; departments are auto-detected from the file where present.",
        "Update Employees — bulk-update existing employees from a spreadsheet; only the columns present in your file are changed, everything else is left untouched.",
      ]},
      { type: "h", text: "Per-employee details payroll needs" },
      { type: "list", items: [
        "Salary Assignment — which salary structure/CTC applies to this employee.",
        "Payroll Policy Assignment — which policy (working hours, overtime, leave rules) governs this employee.",
        "Bank Details — account number and IFSC/routing information, used to generate the bank transfer file.",
        "Tax Details — PAN/SSN/NI number or local equivalent, tax regime elections where applicable.",
        "Compliance Details — PF/ESI applicability, statutory identifiers specific to the employee.",
      ]},
      { type: "table", title: "Example — Employee Record (Sample Data)", headers: ["Field", "Sample Value"], rows: [
        ["Name", "Asha Verma"],
        ["Department", "Engineering"],
        ["Designation", "Software Engineer"],
        ["Bank Account", "XXXXXXXX4321 (masked)"],
        ["PAN", "ABCDE1234F"],
        ["PF Applicable", "Yes"],
      ]},
      { type: "callout", tone: "tip", title: "Bulk update, not bulk re-import", text: "If you only need to change department or designation for a batch of employees, use Update Employees rather than re-importing everyone — it changes only the columns you include and leaves the rest of each record intact." },
    ],
  },

  // ── Step 9 ─────────────────────────────────────────────────────────
  {
    id: "attendance-management",
    number: 9,
    title: "Attendance Management",
    icon: "CalendarCheck",
    summary: "Recording attendance manually, in bulk, and how it feeds payroll.",
    content: [
      { type: "p", text: "Attendance for the payroll period is what payroll actually calculates against — pay is pro-rated based on working days present, half-days, and unpaid leave." },
      { type: "h", text: "Ways to record attendance" },
      { type: "list", items: [
        "Manual Attendance — mark individual employees for a specific date.",
        "Bulk Attendance — mark a group of employees at once for a date range.",
        "Import Attendance — upload a spreadsheet covering many employees and dates in one file.",
      ]},
      { type: "h", text: "What attendance tracks" },
      { type: "list", items: [
        "Working Days — days counted toward full attendance for the period.",
        "Half Days — partial attendance, typically pro-rated at 50%.",
        "Holidays — organization-wide non-working days, excluded from attendance requirements.",
        "Shift Attendance — for organizations with shift-based schedules, attendance is tracked per shift.",
      ]},
      { type: "callout", tone: "warning", title: "Duplicate uploads are guarded", text: "Uploading attendance for a period that already has records prompts an Override confirmation rather than silently creating duplicates — choose Override only when you intend to replace the existing month's data." },
      { type: "callout", tone: "danger", title: "Locked periods", text: "Once a payroll run for a period has been finalized, attendance for that period is locked — further edits or uploads require an explicit override, with a clear warning, since changing attendance after payroll has been calculated can create a mismatch between attendance and pay." },
    ],
  },

  // ── Step 10 ────────────────────────────────────────────────────────
  {
    id: "leave-management",
    number: 10,
    title: "Leave Management",
    icon: "Plane",
    summary: "Leave types, approvals, balances, and how leave affects pay.",
    content: [
      { type: "p", text: "Leave Management determines which absences are paid, which reduce pay, and how leave balances are tracked over time." },
      { type: "h", text: "Core concepts" },
      { type: "list", items: [
        "Leave Types — categories such as Casual, Sick, Earned/Annual, each with its own accrual and eligibility rules.",
        "Leave Approval — requests move through a request → approve/reject workflow before they affect attendance.",
        "Leave Balance — the running total of leave available to an employee, decremented as approved leave is taken.",
        "Paid Leave — approved leave within an employee's balance; does not reduce pay.",
        "Loss of Pay (LOP) — leave taken beyond available balance, or unapproved absence; reduces that period's pay proportionally.",
        "Holiday Calendar — organization-wide holidays are separate from personal leave and don't consume leave balance.",
      ]},
      { type: "h", text: "Attendance integration" },
      { type: "p", text: "Approved leave is reflected in attendance for the period automatically — payroll doesn't need a separate leave lookup, it reads the same attendance records that leave approval has already updated." },
      { type: "table", title: "Example — Leave Request (Sample Data)", headers: ["Field", "Sample Value"], rows: [
        ["Employee", "Rahul Nair"],
        ["Leave Type", "Casual Leave"],
        ["Dates", "12–13 Jun 2026 (2 days)"],
        ["Balance Before", "6 days"],
        ["Status", "Approved"],
      ]},
      { type: "callout", tone: "tip", title: "Approve before cut-off", text: "Leave approved after the attendance cut-off date for a period won't be reflected in that period's payroll run — approve pending leave requests before running payroll." },
    ],
  },

  // ── Step 11 ────────────────────────────────────────────────────────
  {
    id: "payroll-run",
    number: 11,
    title: "Payroll Run",
    icon: "PlayCircle",
    summary: "The full end-to-end process of calculating and generating a payroll run.",
    content: [
      { type: "p", text: "A Payroll Run is the actual calculation event for a period — it validates inputs, computes pay for every included employee, and produces payslips." },
      { type: "flow", title: "Payroll run process", steps: [
        "Select Payroll Month", "Validate Employees", "Validate Attendance", "Validate Leaves",
        "Calculate Earnings", "Calculate Deductions", "Calculate Taxes",
        "Generate Payslips", "Review Payroll", "Approve Payroll", "Lock Payroll",
      ]},
      { type: "h", text: "Step by step" },
      { type: "list", items: [
        "Select Payroll Month — choose the period to run; the system checks it doesn't overlap an existing run for the same organization.",
        "Validate Employees / Attendance / Leaves — the run checks that active employees have attendance recorded for the period before proceeding.",
        "Calculate Earnings — gross pay per employee based on salary structure and attendance.",
        "Calculate Deductions & Taxes — statutory and voluntary deductions applied per the employee's jurisdiction and tax details.",
        "Generate Payslips — one payslip per included employee, itemizing every component.",
        "Review → Approve → Lock — the run advances through status stages (see Step 12) before disbursement.",
      ]},
      { type: "h", text: "Who to run payroll for" },
      { type: "list", items: [
        "A single employee — for off-cycle corrections or new joiners mid-period.",
        "Selected employees — a chosen subset, e.g. one department.",
        "All employees — the standard full-organization run.",
      ]},
      { type: "callout", tone: "info", title: "One run per period", text: "The system prevents creating a second payroll run for a period that already has one — you'll be directed to the existing run instead of accidentally duplicating it." },
    ],
  },

  // ── Step 12 ────────────────────────────────────────────────────────
  {
    id: "payroll-approval",
    number: 12,
    title: "Payroll Approval",
    icon: "CheckCircle2",
    summary: "The Draft → Review → Approved → Authorized → Paid → Closed lifecycle.",
    content: [
      { type: "p", text: "Every payroll run moves through a defined lifecycle so there's always a clear, auditable record of who approved what and when." },
      { type: "flow", title: "Run status lifecycle", steps: ["Draft", "Review", "Approved", "Authorized", "Paid", "Closed"] },
      { type: "list", items: [
        "Draft — initial calculation, freely editable, not yet reviewed.",
        "Review — submitted for review; figures should be considered close to final at this point.",
        "Approved — reviewed and signed off; bank transfer file and reports become available.",
        "Authorized — a further authorization step for organizations requiring dual sign-off before disbursement.",
        "Paid — disbursement has occurred.",
        "Closed — the period is finalized and locked against further changes.",
        "Reject — sends a run back to Draft with a reason, if issues are found during Review.",
        "Reopen — an authorized administrative action to unlock a Closed/Approved run when a genuine correction is required — use sparingly and document why.",
      ]},
      { type: "h", text: "Audit Trail" },
      { type: "p", text: "Every status change, and every material edit to a run, is recorded with who made the change and when — visible to admins reviewing the run's history." },
      { type: "callout", tone: "warning", title: "Avoid editing after Approved", text: "Once a run is Approved, treat it as final unless there's a genuine error. Reopening an approved run should be the exception, not routine practice — see Best Practices (Step 16)." },
    ],
  },

  // ── Step 13 ────────────────────────────────────────────────────────
  {
    id: "payslips",
    number: 13,
    title: "Payslips",
    icon: "FileText",
    summary: "Generating, downloading, emailing, and regenerating payslips.",
    content: [
      { type: "p", text: "A payslip is generated automatically for every employee included in a payroll run, itemizing earnings, deductions, and net pay for that period." },
      { type: "h", text: "What you can do with payslips" },
      { type: "list", items: [
        "Download PDF — a single employee's payslip as a formatted PDF.",
        "Email Payslip — send directly to the employee's registered email.",
        "Bulk Download — download payslips for an entire run at once.",
        "Regenerate Payslip — re-render a payslip after a correction to the underlying run (only relevant while the run isn't yet Closed).",
        "Version History — see prior versions of a payslip if it was regenerated after an edit.",
      ]},
      { type: "table", title: "Example — Payslip Summary (Sample Data)", headers: ["Field", "Sample Value"], rows: [
        ["Employee", "Asha Verma"],
        ["Period", "Jun 2026"],
        ["Gross Earnings", "₹1,16,666"],
        ["Total Deductions", "₹7,700"],
        ["Net Pay", "₹1,08,966"],
      ]},
      { type: "callout", tone: "tip", title: "Bulk download for disbursement day", text: "On processing day, use Bulk Download rather than downloading payslips one at a time — it's the same underlying export, just for the whole run." },
    ],
  },

  // ── Step 14 ────────────────────────────────────────────────────────
  {
    id: "reports",
    number: 14,
    title: "Reports",
    icon: "BarChart3",
    summary: "The report types available and what each one is for.",
    content: [
      { type: "p", text: "Reports sits alongside Payroll Runs and gives finance/compliance teams the aggregated views they need, in multiple export formats (PDF, CSV, TXT, XLSX)." },
      { type: "h", text: "Available report types" },
      { type: "list", items: [
        "Payroll Register — the full run-level breakdown of every employee's pay for a period.",
        "Salary Register — a summary view of salary components across the organization.",
        "Attendance Report — attendance summary for a period, useful for reconciling with payroll.",
        "Leave Report — leave taken and balances across the organization.",
        "Tax Report — withholding summary (TDS/PAYE/federal-state tax, depending on jurisdiction).",
        "Compliance Report — statutory contribution summary (PF/ESI/PT or the local equivalents).",
        "Bank Transfer Report — the disbursement file used to instruct your bank, available once a run reaches Approved or later.",
        "Contribution Report — employer + employee statutory contributions for a period.",
        "Audit Report — the change/approval history for runs in a period.",
        "Monthly Summary / Annual Summary — rolled-up totals for a month or full financial year.",
      ]},
      { type: "callout", tone: "info", title: "Availability follows run status", text: "A report becomes available once its underlying run reaches Approved status or later (Authorized, Paid, Closed) — reports for Draft/Review runs aren't shown as available yet, since the figures aren't final." },
    ],
  },

  // ── Step 15 ────────────────────────────────────────────────────────
  {
    id: "email-integration",
    number: 15,
    title: "Email Integration",
    icon: "Mail",
    summary: "How payslip and notification emails are sent.",
    content: [
      { type: "p", text: "Payroll can notify employees automatically at key points in the process — new payslip available, leave request decisions, and payroll-related announcements." },
      { type: "h", text: "What's covered" },
      { type: "list", items: [
        "SMTP — outbound mail configuration used to send notifications and payslip emails.",
        "IMAP — used where the platform needs to read replies to sent notifications, depending on your setup.",
        "Employee Notifications — general Payroll-related alerts to employees.",
        "Payslip Emails — sent when a payslip is generated or bulk-emailed for a run.",
        "Leave Emails — sent on leave request submission, approval, or rejection.",
        "Payroll Notifications — sent to admins/approvers at key lifecycle transitions (e.g. a run reaching Review).",
      ]},
      { type: "callout", tone: "tip", title: "Test before your first live run", text: "Send a test payslip email to yourself before your organization's first real payroll run, to confirm delivery is working as expected." },
    ],
  },

  // ── Step 16 ────────────────────────────────────────────────────────
  {
    id: "best-practices",
    number: 16,
    title: "Best Practices",
    icon: "Award",
    summary: "Habits that keep payroll accurate and compliant month over month.",
    content: [
      { type: "list", items: [
        "Verify attendance is complete for every active employee before starting a payroll run — an incomplete attendance set produces incorrect pro-rated pay.",
        "Verify leave requests for the period are all approved or rejected — don't leave anything pending across the cut-off date.",
        "Review the payroll run carefully at the Review stage — this is the point to catch errors, before Approval.",
        "Lock payroll (advance to Closed) after approval and disbursement — this protects the period's figures from accidental later edits.",
        "Keep your Compliance profile updated whenever your jurisdiction changes statutory rates.",
        "Avoid editing an already-Approved payroll run — if a correction is genuinely needed, use Reopen deliberately and document the reason, rather than quietly editing figures.",
      ]},
      { type: "callout", tone: "tip", title: "Build a monthly checklist", text: "Most of the mistakes in Step 17 are caught by a short, repeatable pre-run checklist — see the interactive checklist below." },
      { type: "checklist", title: "Monthly payroll processing checklist", items: [
        "All new joiners for the period added to Employees",
        "All exits/terminations processed and end-dated",
        "Attendance imported/marked for the full period",
        "All leave requests approved or rejected",
        "Salary structure changes (increments, promotions) applied before the run",
        "Bank details verified for any new employees",
        "Payroll run created and Draft figures spot-checked",
        "Run moved to Review and reviewed by a second person",
        "Run Approved and Bank Transfer File generated",
        "Payslips bulk-emailed to employees",
        "Reports generated and archived",
        "Run advanced to Closed",
      ]},
    ],
  },

  // ── Step 17 ────────────────────────────────────────────────────────
  {
    id: "common-mistakes",
    number: 17,
    title: "Common Mistakes",
    icon: "AlertTriangle",
    summary: "The most frequent payroll errors, and how to avoid them.",
    content: [
      { type: "list", items: [
        "Missing Attendance — running payroll before attendance is fully recorded for the period, producing incorrect pro-rated pay.",
        "Wrong Tax Configuration — jurisdiction or tax regime set incorrectly, leading to wrong withholding.",
        "Duplicate Salary Components — the same allowance added twice in a custom salary structure, inflating gross pay.",
        "Missing Bank Details — an employee without bank details on file can't be included in the bank transfer file.",
        "Invalid Compliance Setup — statutory identifiers (PF/ESI numbers, tax IDs) left blank or incorrect, causing filing issues later.",
        "Incorrect Payroll Policy — an employee assigned the wrong policy, applying the wrong working-hours or leave rules to their pay.",
      ]},
      { type: "callout", tone: "warning", title: "Most of these are caught by review", text: "A careful Review-stage check before Approval catches the majority of these — see Best Practices (Step 16)." },
    ],
  },

  // ── Step 18 ────────────────────────────────────────────────────────
  {
    id: "faq",
    number: 18,
    title: "Frequently Asked Questions",
    icon: "HelpCircle",
    summary: "Common questions from first-time Payroll admins.",
    content: [
      { type: "faq", items: [
        { q: "Do I need to set up Compliance before adding employees?", a: "You can add employees first, but statutory deductions won't calculate correctly until Compliance is configured for your jurisdiction — do it before your first payroll run at the latest." },
        { q: "Can I change payroll frequency after employees are already set up?", a: "Yes, frequency is a policy-level setting independent of employee records, but changing it mid-cycle will affect how the next period's dates are calculated — plan the switch to align with a period boundary." },
        { q: "What happens if I upload attendance twice for the same month?", a: "The system detects the existing records and asks you to confirm an Override before replacing them — it won't silently create duplicates." },
        { q: "Can I run payroll for just one employee?", a: "Yes — the Payroll Run wizard supports running for a single employee, a selected subset, or all employees." },
        { q: "What's the difference between Approved and Authorized?", a: "Approved means the run has been reviewed and signed off; Authorized is an additional sign-off step for organizations that require dual authorization before disbursement." },
        { q: "Can I edit a payroll run after it's Approved?", a: "It's discouraged — treat Approved as final. If a genuine correction is needed, use the Reopen action deliberately rather than editing in place." },
        { q: "Why is a report showing as 'pending' instead of 'available'?", a: "Reports become available once the underlying run reaches Approved status or later. A Draft or Review-stage run's reports aren't final yet." },
        { q: "How do I update just one field for many employees, like department?", a: "Use Update Employees with a spreadsheet containing only the employee identifier and the column you want to change — other fields are left untouched." },
        { q: "Does department get created automatically from an import file?", a: "Yes — if your import file includes a Department column, it's used automatically; if it's missing, existing fallback logic applies rather than leaving it blank." },
        { q: "What happens to leave balance if a request is rejected?", a: "Rejected leave requests don't consume leave balance — the balance is only decremented on approval." },
        { q: "Can attendance be edited after payroll for that period is finalized?", a: "No, not by default — a locked/finalized period requires an explicit Override to modify, with an informational warning shown first." },
        { q: "What's the difference between Gross Salary and CTC?", a: "CTC includes employer-side contributions; Gross Salary is what's shown as earnings on the payslip before deductions, i.e. CTC minus employer contributions." },
        { q: "Can I have different salary structures for different roles?", a: "Yes — most organizations define a handful of standard structures by grade or role and assign employees to the appropriate one." },
        { q: "How do I generate a bank transfer file?", a: "Once a run reaches Approved, the Bank Transfer File becomes available for download from the run's detail view and also appears in Reports, in your choice of format." },
        { q: "Can payslips be re-sent if an employee didn't receive the email?", a: "Yes — payslip emails can be resent individually or the run can be bulk-emailed again." },
        { q: "What if an employee joins mid-period?", a: "Their pay is pro-rated based on their date of joining relative to the period's working days." },
        { q: "Is Enterprise mode required to use the Payroll module?", a: "No — Standard mode covers single-country payroll fully. Enterprise is only needed for multi-jurisdiction configuration." },
        { q: "Can two payroll runs exist for the same period?", a: "No — the system blocks creating a second run for a period that already has one, and directs you to the existing run instead." },
        { q: "Where do statutory rate changes get updated?", a: "In Compliance Setup — review and update rates there whenever your jurisdiction announces a change." },
        { q: "Who can approve a payroll run?", a: "Approval actions are restricted to Organization Admins (and any additional approver roles your organization has configured)." },
      ]},
    ],
  },

  // ── Step 19 ────────────────────────────────────────────────────────
  {
    id: "troubleshooting",
    number: 19,
    title: "Troubleshooting",
    icon: "Wrench",
    summary: "Common issues and how to resolve them.",
    content: [
      { type: "trouble", items: [
        { issue: "Attendance not showing for an employee", cause: "Attendance wasn't marked/imported for that employee, or was recorded outside the date range you're checking.", solution: "Re-check the date range and confirm the employee wasn't missed in a bulk upload; add the missing records and re-run validation." },
        { issue: "Employee missing from the payroll run", cause: "The employee may be inactive, missing required details (bank/tax), or not included in the selected employee set for the run.", solution: "Check the employee's status and required fields in Employees, then re-select them when creating or recalculating the run." },
        { issue: "Payslip amount doesn't match expectations", cause: "Usually a mismatch between attendance, salary structure, or an unexpected mid-period salary change.", solution: "Compare the payslip's itemized breakdown against the employee's current salary structure and attendance for the period; recalculate after correcting the source data." },
        { issue: "Tax amount looks wrong", cause: "Jurisdiction, tax regime, or a recently changed tax slab may not be reflected yet.", solution: "Confirm the employee's jurisdiction/tax details and check Compliance Setup for the current slab configuration." },
        { issue: "Compliance validation failed when creating a run", cause: "A required compliance field (e.g. a statutory ID) is missing for the organization or an included employee.", solution: "Complete the missing field in Compliance Setup or the employee's record, then retry creating the run." },
        { issue: "\"Payroll Run for this period already exists\"", cause: "A run already exists for the organization covering an overlapping period.", solution: "This is expected duplicate-prevention behavior — open the existing run from the message instead of creating a new one." },
      ]},
    ],
  },

  // ── Step 20 ────────────────────────────────────────────────────────
  {
    id: "congratulations",
    number: 20,
    title: "Congratulations",
    icon: "PartyPopper",
    summary: "You've completed the Payroll onboarding guide.",
    content: [
      { type: "p", text: "You've now walked through every stage of the Payroll module, from organization setup through to reports. Here's a quick recap of what \"ready\" looks like:" },
      { type: "checklist", title: "Readiness checklist", items: [
        "Organization Setup Complete — currency, financial year, and time zone confirmed",
        "Jurisdiction Configured — country/state set correctly for your compliance rules",
        "Compliance Configured — statutory contributions and tax rules set up",
        "Employees Configured — salary, bank, and tax details on file",
        "Attendance Ready — a process in place for recording attendance each period",
        "Leave Ready — leave types and approval flow in place",
        "Payroll Ready — a policy and salary structure assigned to every employee",
        "Reports Ready — you know where to find and export each report type",
      ]},
      { type: "callout", tone: "success", title: "You are now ready to process Payroll.", text: "Bookmark this guide — every section here works as a standing reference, not just a one-time walkthrough." },
    ],
  },
];

export const GUIDANCE_META = {
  title: "Payroll Guidance",
  subtitle: "A complete reference guide for setting up and running Zoiko Payroll — from organization setup to reports.",
  totalSteps: GUIDANCE_STEPS.length,
};
