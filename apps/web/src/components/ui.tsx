import { clsx } from "clsx";

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[1240px] px-5 pb-12 pt-8 sm:px-9", className)}>{children}</div>;
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx("min-w-0 rounded-[14px] border border-edge bg-surface p-6", className)}>{children}</section>;
}

export function PanelTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={clsx("font-display text-lg font-normal text-snow", className)}>{children}</h2>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-edge bg-surface/60 p-8 text-center">
      <h2 className="font-display text-lg font-normal text-snow">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>
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
        "focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "rounded-[10px] border border-edge bg-surface px-3 py-2 text-sm text-snow placeholder:text-faint focus:border-gold focus:outline-none",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "rounded-[10px] border border-edge bg-surface px-3 py-2 text-sm text-snow focus:border-gold focus:outline-none",
        props.className,
      )}
    />
  );
}

export function MiniKpi({
  label,
  value,
  side,
  sideTone,
  sideCaption,
}: {
  label: string;
  value: string;
  side: string;
  sideTone: "positive" | "muted" | "negative";
  sideCaption: string;
}) {
  const tones = { positive: "text-positive-text", muted: "text-muted", negative: "text-negative-text" };
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-edge bg-surface px-5 py-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
        <div className="mt-1.5 truncate text-[22px] font-semibold tabular-nums text-snow">{value}</div>
      </div>
      <span className={clsx("shrink-0 text-right text-xs font-medium", tones[sideTone])}>
        {side}
        <br />
        <span className="font-normal text-faint">{sideCaption}</span>
      </span>
    </div>
  );
}
