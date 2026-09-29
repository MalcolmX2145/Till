/** Stands in for screens that arrive in later features. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-500">Coming in a later step.</p>
    </div>
  );
}
