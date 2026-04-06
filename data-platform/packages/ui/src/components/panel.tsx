import type { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={clsx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</section>;
}
