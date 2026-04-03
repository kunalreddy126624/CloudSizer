import type { PropsWithChildren } from "react";

export function Toolbar({ children }: PropsWithChildren) {
  return <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">{children}</div>;
}
