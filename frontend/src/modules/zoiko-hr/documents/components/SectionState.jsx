import { ShieldOff } from "lucide-react";
import { TableSkeleton, CardGridSkeleton, SkeletonLine } from "../../../../components/LoadingSkeletons";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { EntitlementDenied } from "../../../../components/EntitlementDenied";

/**
 * The ONE place a documents section decides between loading, denied, error, empty and content
 * (docs/new_docs/ZHR-DOCS-ARCH-001 §9.3). Every section renders exactly one of these, so a page can never show two
 * spinners, a spinner next to stale numbers, or an empty state when the request actually failed.
 *
 * Works with a react-query result (`query`) or plain values (`loading`, `error`, `data`).
 *
 * @param {{
 *   query?: { isPending?: boolean, isLoading?: boolean, isError?: boolean, error?: any, data?: any, refetch?: () => any },
 *   loading?: boolean, error?: any, data?: any, onRetry?: () => any,
 *   skeleton?: 'table'|'cards'|'list', label?: string,
 *   empty?: { title: string, message?: string, icon?: any }, isEmpty?: (data: any) => boolean,
 *   children: (data: any) => any,
 * }} props
 */
export default function SectionState({
  query, loading, error, data, onRetry, skeleton = "table", label = "Loading", empty, isEmpty, children,
}) {
  const isLoading = query ? Boolean(query.isPending ?? query.isLoading) : Boolean(loading);
  const err = query ? (query.isError ? query.error : null) : error;
  const value = query ? query.data : data;
  const retry = onRetry || query?.refetch;

  if (isLoading) {
    if (skeleton === "cards") return <CardGridSkeleton label={label} />;
    if (skeleton === "list") {
      return (
        <div role="status" aria-label={label} className="space-y-3 py-4">
          <SkeletonLine className="h-4 w-2/3" /><SkeletonLine className="h-4 w-1/2" /><SkeletonLine className="h-4 w-3/5" />
        </div>
      );
    }
    return <TableSkeleton label={label} />;
  }

  if (err) {
    const status = err?.status;
    if (status === 402 || err?.entitlement) {
      return <EntitlementDenied featureKey={err?.entitlement?.feature_key} reasonCode={err?.entitlement?.reason_code} onRetry={retry} />;
    }
    if (status === 403) {
      return (
        <div role="alert" className="flex flex-col items-center gap-2 py-14 text-center">
          <ShieldOff size={26} className="text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">You don't have access to this</p>
          <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Ask your organization admin if you think you should.</p>
        </div>
      );
    }
    return <DocumentErrorState message={err?.message || "Something went wrong while loading."} onRetry={retry} />;
  }

  const emptyNow = isEmpty ? isEmpty(value) : (value == null || (Array.isArray(value) && value.length === 0)
    || (Array.isArray(value?.items) && value.items.length === 0));
  if (emptyNow && empty) {
    return <DocumentEmptyState icon={empty.icon} title={empty.title} message={empty.message} />;
  }
  return children(value);
}
