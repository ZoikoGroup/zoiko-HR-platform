/** "+1 day" after a check-out that falls on the day after the work date (an overnight shift). Text, not colour alone. */
export default function NextDayHint() {
  return (
    <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 font-sans text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
      title="Checked out the next day">
      +1 day
    </span>
  );
}
