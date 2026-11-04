/*!
 * Zoiko HR Platform - Access Reason Select Component
 * Grouped select dropdown for JIT support access reason selection
 * ---------------------------------------------------------------
 * Features:
 * - Grouped categories with icons
 * - Keyboard navigation (Up/Down/Enter)
 * - Close on outside click & Escape
 * - ARIA-compliant accessibility
 * - Tailwind CSS styling (slate/blue palette)
 * - Lucide React icons
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Users,
  Settings,
  ShieldCheck,
} from "lucide-react";

// -- Type Definitions -------------------------------------------------------

export type AccessReasonGroup = {
  /** Unique identifier for the group */
  id: string;
  /** Display name/category label */
  label: string;
  /** Lucide React component for the category icon */
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Array of option labels in this group */
  options: string[];
};

export type AccessReasonOption = {
  /** The display label shown in the dropdown */
  label: string;
  /** Unique identifier (used for value comparison) */
  value: string;
  /** Optional description/sub-text */
  description?: string;
};

// -- Grouped Dataset --------------------------------------------------------

/**
 * Pre-defined grouped access reason options for the HR platform.
 * Categories match the JIT support access workflow requirements.
 * Each group includes its associated Lucide React icon component.
 */
export const ACCESS_REASON_GROUPS: AccessReasonGroup[] = [
  {
    id: "billing-subscription",
    label: "BILLING & SUBSCRIPTION",
    Icon: CreditCard,
    options: [
      "Billing discrepancy investigation",
      "Subscription or plan validation",
      "Invoice or charge review",
    ],
  },
  {
    id: "payroll-hr",
    label: "PAYROLL & HR OPERATIONS",
    Icon: Users,
    options: [
      "Payroll variance review",
      "Employee record issue investigation",
      "Leave or attendance issue review",
    ],
  },
  {
    id: "technical-integration",
    label: "TECHNICAL & INTEGRATION SUPPORT",
    Icon: Settings,
    options: [
      "Integration troubleshooting",
      "Report or data reconciliation",
      "Workflow configuration review",
    ],
  },
  {
    id: "security-compliance",
    label: "SECURITY & COMPLIANCE",
    Icon: ShieldCheck,
    options: [
      "Security or suspicious activity review",
      "Compliance or audit support",
      "Tenant admin requested support",
    ],
  },
];

// -- AccessReasonSelect Component -------------------------------------------

/**
 * Grouped select dropdown for access reason selection.
 * Provides a categorized list of options with icons, keyboard navigation,
 * and full ARIA compliance.
 *
 * Usage:
 *   <AccessReasonSelect
 *     value={selectedReason}
 *     onChange={setSelectedReason}
 *     groups={ACCESS_REASON_GROUPS}
 * />
 *
 *   // With custom className:
 *   <AccessReasonSelect
 *     value={selectedReason}
 *     onChange={setSelectedReason}
 *     className="max-w-md"
 *   />
 */
export interface AccessReasonSelectProps {
  /** Currently selected value. Format: "groupId:optionValue" */
  value?: string;
  /** Callback when selection changes */
  onChange: (value: string | null) => void;
  /** Optional groups prop (defaults to ACCESS_REASON_GROUPS) */
  groups?: AccessReasonGroup[];
  /** Optional placeholder text when nothing selected */
  placeholder?: string;
  /** Optional custom className overrides */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Renders a grouped select dropdown for access reason selection.
 * Features:
 * - Category headers with group-specific icons
 * - Option items with checkmark for currently selected option
 * - Keyboard navigation (Up/Down/Enter arrows)
 * - Close on Escape key press
 * - Close on outside click
 * - ARIA-compliant attributes (role="listbox", role="option", aria-selected, etc.)
 */
export function AccessReasonSelect({
  value,
  onChange,
  groups = ACCESS_REASON_GROUPS,
  placeholder = "Access reason *",
  className = "",
  disabled = false,
}: AccessReasonSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedOptionGlobalIndex, setFocusedOptionGlobalIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Parse the value to determine which group and option is selected.
  // Value format: "groupId:optionValue" (e.g., "billing-subscription:Billing discrepancy investigation")
  const [selectedGroupId, selectedOptionValue] = value
    ? value.includes(":")
      ? value.split(":", 2)
      : ["", value]
    : ["", ""];

  // Determine if any option is currently selected
  const hasSelection = !!selectedOptionValue && selectedOptionValue !== "";

  // Map each group to its options for easier lookup
  const groupedOptions = groups.map((group) => ({
    group,
    options: group.options.map((opt) => ({
      label: opt,
      value: opt,
    })),
  }));

  // Handle option selection: close dropdown and notify parent
  const handleSelectOption = useCallback(
    (groupId: string, optionValue: string) => {
      onChange(`${groupId}:${optionValue}`);
      setIsOpen(false);
      setFocusedOptionGlobalIndex(-1);
    },
    [onChange]
  );

  // Close dropdown on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setFocusedOptionGlobalIndex(-1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedOptionGlobalIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Render the trigger button
  const triggerBtnClassName = `
    w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3
    text-sm text-slate-700 outline-none focus:border-brand-300
    focus:outline-none focus:ring-2 focus:ring-brand/30
    hover:bg-slate-50 ${disabled ? "opacity-50 cursor-not-allowed" : ""}
  `;

  // Build the label to display in the trigger button
  const triggerLabel = hasSelection
    ? selectedOptionValue
    : placeholder.replace(" *", "");

  // Render option item classes based on selection/focus state
  const getOptionClassName = (
    isSelected: boolean,
    isFocused: boolean
  ) => {
    const base = `
      flex items-center rounded-xl px-3 py-2
      text-sm font-medium transition-colors
      cursor-pointer
    `;
    const hover = "hover:bg-slate-100";
    const selected = isSelected
      ? "bg-brand-50 text-brand-700 font-semibold"
      : "";
    const focus = isFocused
      ? "bg-brand-100 text-brand-700"
      : "";

    return `${base} ${hover} ${selected} ${focus}`;
  };

  // Flatten groups for keyboard navigation
  const allOptions: Array<{ groupId: string; label: string; groupLabel: string }> = [];
  groups.forEach((g) => {
    g.options.forEach((opt) => {
      allOptions.push({ groupId: g.id, label: opt, groupLabel: g.label });
    });
  });

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        className={triggerBtnClassName}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={
          hasSelection
            ? `Access reason selected: ${selectedOptionValue}`
            : `Access reason selection, ${placeholder}, collapsed`
        }
      >
        <div className="flex items-center justify-between w-full">
          <span>{triggerLabel}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      </button>

      {/* Dropdown Menu Overlay */}
      {isOpen && (
        <div
          role="listbox"
          aria-modal="false"
          className="
            absolute
            left-0
            right-0
            rounded-xl border border-slate-200 bg-white
            shadow-xl z-40
            mt-1
            overflow-y-auto
            max-h-[400px]
          "
        >
          {/* Category Groups */}
          {groupedOptions.map((groupData, groupIndex) => {
            const group = groupData.group;
            const CategoryIcon = group.Icon;

            return (
              <div
                key={group.id}
                className="
                  border-b border-slate-100
                "
              >
                {/* Category Header */}
                <div
                  role="option"
                  tabIndex={0}
                  onClick={() =>
                    handleSelectOption(group.id, group.options[0])
                  }
                  className="
                    flex items-center gap-2 rounded-t-xl
                    px-3 py-1.5 text-xs font-semibold uppercase
                    tracking-wider bg-slate-50 text-slate-500
                    cursor-default
                  "
                  aria-label={group.label}
                >
                  {/* Category icon */}
                  <CategoryIcon size={16} className="shrink-0" />
                  <span>{group.label}</span>
                </div>

                {/* Options List */}
                <div
                  role="group"
                  aria-label={group.label}
                  className="
                    max-h-[200]
                    overflow-y-auto
                  "
                >
                  {group.options.map((optionValue, optionIndex) => {
                    const isSelected =
                      selectedGroupId === group.id &&
                      selectedOptionValue === optionValue;

                    const optionOnClick = () => {
                      handleSelectOption(group.id, optionValue);
                    };

                    const onKeyDown = (
                      e: React.KeyboardEvent
                    ) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          optionIndex + 1 < group.options.length
            ? optionIndex + 1
            : 0;
        setFocusedOptionGlobalIndex(
          groupIndex * group.options.length + nextIndex
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          optionIndex - 1 >= 0 ? optionIndex - 1 : group.options.length - 1;
        setFocusedOptionGlobalIndex(
          groupIndex * group.options.length + prevIndex
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelectOption(group.id, optionValue);
      }
    };

                    return (
                      <div
                        key={optionValue}
                        role="option"
                        tabIndex={0}
                        onClick={optionOnClick}
                        onKeyDown={onKeyDown}
                        className={getOptionClassName(
                          isSelected,
                          focusedOptionGlobalIndex === groupIndex * group.options.length + optionIndex &&
                            selectedGroupId === group.id
                        )}
                        aria-selected={isSelected}
                        aria-label={optionValue}
                      >
                        {/* Checkmark for selected option */}
                        {isSelected && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-brand-600 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span
                          className={isSelected
                            ? "font-medium text-brand-700"
                            : "text-slate-700"}
                        >
                          {optionValue}
                        </span>
                        {/* Optional description/sub-text showing secondary word */}
                        {optionValue.split(" ").length > 1 && !isSelected && (
                          <span
                            className="ml-2 text-xs text-slate-400 block"
                          >
                            {optionValue.split(" ")[1]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state when no groups are provided */}
          {groups.length === 0 && (
            <div
              className="p-4 text-slate-500 text-sm"
              aria-label="No access reasons available"
            >
              No access reasons configured
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
 * Exports
 * ---------------------------------------------------------------*/

/**
 * Static dataset array matching the grouped access reason categories.
 * Can be used independently or with the AccessReasonSelect component.
 * Can be used independently or with the AccessReasonSelect component.
 * Each entry contains the group ID, label, icon name, and options.
 */
export const ACCESS_REASON_DATASET = [
  {
    groupId: "billing-subscription",
    label: "BILLING & SUBSCRIPTION",
    iconName: "CreditCard",
    options: [
      "Billing discrepancy investigation",
      "Subscription or plan validation",
      "Invoice or charge review",
    ],
  },
  {
    groupId: "payroll-hr",
    label: "PAYROLL & HR OPERATIONS",
    iconName: "Users",
    options: [
      "Payroll variance review",
      "Employee record issue investigation",
      "Leave or attendance issue review",
    ],
  },
  {
    groupId: "technical-integration",
    label: "TECHNICAL & INTEGRATION SUPPORT",
    iconName: "Settings",
    options: [
      "Integration troubleshooting",
      "Report or data reconciliation",
      "Workflow configuration review",
    ],
  },
  {
    groupId: "security-compliance",
    label: "SECURITY & COMPLIANCE",
    iconName: "ShieldCheck",
    options: [
      "Security or suspicious activity review",
      "Compliance or audit support",
      "Tenant admin requested support",
    ],
  },
];