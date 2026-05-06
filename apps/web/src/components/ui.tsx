import { clsx } from "clsx";

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx("min-w-0 rounded-lg border border-line bg-panel p-4 shadow-glow", className)}>{children}</section>;
}

export function KpiCard({
  label,
  value,
  detail,
  tone = "cyan",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "cyan" | "green" | "magenta" | "amber" | "slate";
}) {
  const tones = {
    cyan: "text-cyan",
    green: "text-green",
    magenta: "text-magenta",
    amber: "text-amber",
    slate: "text-slate-200",
  };

  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-3 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      {detail ? <div className="mt-2 text-xs text-slate-400">{detail}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel/60 p-8 text-center">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

export function Button({
  children,
  className,
  type = "button",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled}
      {...props}
      className={clsx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("focus-ring rounded-md border border-line bg-ink px-3 py-2 text-sm text-white", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("focus-ring rounded-md border border-line bg-ink px-3 py-2 text-sm text-white", props.className)} />;
}
