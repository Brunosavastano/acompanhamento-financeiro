export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-edge-soft bg-night/85 px-5 py-3.5 backdrop-blur-[10px] sm:px-9 lg:sticky lg:top-0">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-normal tracking-[0.02em] text-snow">{title}</h1>
        {description ? <p className="mt-0.5 text-xs text-faint">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
