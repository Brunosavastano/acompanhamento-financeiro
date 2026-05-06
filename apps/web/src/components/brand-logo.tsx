import Image from "next/image";
import { clsx } from "clsx";

const sizeClasses = {
  sm: "h-8 w-8 p-0.5",
  md: "h-10 w-10 p-1",
  lg: "h-12 w-12 p-1",
};

export function BrandLogo({ className, size = "md" }: { className?: string; size?: keyof typeof sizeClasses }) {
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-md border border-line bg-white/5", sizeClasses[size], className)}>
      <Image
        src="/savastano-logo.png"
        alt="Savastano"
        width={96}
        height={126}
        priority={size === "lg"}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
