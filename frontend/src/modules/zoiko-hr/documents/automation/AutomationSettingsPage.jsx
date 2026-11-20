import { useState } from "react";
import { OrganizationDocumentsLayout } from "../ui";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import RulesTab from "./RulesTab";
import RunHistoryTab from "./RunHistoryTab";
import AutomationOrgSettingsTab from "./AutomationOrgSettingsTab";
import TemplatesTab from "./TemplatesTab";
import RetentionTab from "./RetentionTab";

const TABS = [["rules", "Rules"], ["runs", "Run history"], ["templates", "Templates"], ["retention", "Retention"], ["settings", "Settings"]];

/** Admin → Documents → Automation (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3). */
export default function AutomationSettingsPage() {
  const [tab, setTab] = useState("rules");
  return (
    <OrganizationDocumentsLayout title="Documents Automation" subtitle="Rules that act on document events, their run history, notification wording and retention.">
      <div className="space-y-5">
        <DocsBreadcrumb items={[{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Automation" }]} />
        <div role="tablist" aria-label="Automation" className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {TABS.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
        {tab === "rules" && <RulesTab />}
        {tab === "runs" && <RunHistoryTab />}
        {tab === "settings" && <AutomationOrgSettingsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "retention" && <RetentionTab />}
      </div>
    </OrganizationDocumentsLayout>
  );
}
