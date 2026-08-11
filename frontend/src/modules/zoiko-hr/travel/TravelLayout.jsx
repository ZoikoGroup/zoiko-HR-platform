import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/travel" },
  { label: "Requests", href: "/zoiko-hr/travel/requests" },
  { label: "Approvals", href: "/zoiko-hr/travel/approvals" },
  { label: "Expenses", href: "/zoiko-hr/travel/expenses" },
  { label: "Settings", href: "/zoiko-hr/travel/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={false}
          className={({ isActive }) =>
            `whitespace-nowrap px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-200 ${
              isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/40" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function TravelLayout({ title, subtitle, children }) {
  return (
    <HRPage title={title} subtitle={subtitle}>
      <SubNav />
      {children}
    </HRPage>
  );
}
