import type { PropsWithChildren } from "react";
import Link from "next/link";

import { WorkspaceExplorer } from "@/components/workspace-explorer";

const navItems = [
  { href: "/workspace", label: "Workspace" },
  { href: "/pipelines/pl_daily_sales", label: "Pipelines" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <WorkspaceExplorer />
        <main className="rounded-[32px] border border-slate-200 bg-white/80 shadow-platform backdrop-blur">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Data Platform</p>
              <h1 className="text-2xl font-semibold text-slate-950">Modern Data Workspace</h1>
            </div>
            <nav className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
