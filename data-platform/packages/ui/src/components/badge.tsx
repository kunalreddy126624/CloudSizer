import type { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Badge({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <span className={clsx("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700", className)}>
      {children}
    </span>
  );
}
