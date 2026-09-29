export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100">
      <div
        className="size-8 animate-spin rounded-full border-3 border-slate-300 border-t-slate-700"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
