"use client";

import { useQuery } from "@tanstack/react-query";

import { getRun, getRunLogs } from "@/lib/api";

export default function RunPage({ params }: { params: { id: string } }) {
  const runQuery = useQuery({
    queryKey: ["runs", params.id],
    queryFn: () => getRun(params.id)
  });
  const logsQuery = useQuery({
    queryKey: ["run-logs", params.id],
    queryFn: () => getRunLogs(params.id)
  });

  if (runQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading run...</p>;
  }

  if (runQuery.error instanceof Error) {
    return <p className="text-sm text-rose-600">{runQuery.error.message}</p>;
  }

  if (!runQuery.data) {
    return <p className="text-sm text-slate-500">Run not found.</p>;
  }

  const run = runQuery.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline Run</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{run.id}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">State</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{run.state}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Trigger</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{run.trigger}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Version</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{run.version}</p>
          </div>
        </div>
      </section>
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Execution Logs</p>
        <div className="mt-4 space-y-3 font-mono text-xs">
          {logsQuery.isLoading ? <p className="font-sans text-sm text-slate-500">Loading logs...</p> : null}
          {logsQuery.error instanceof Error ? <p className="font-sans text-sm text-rose-600">{logsQuery.error.message}</p> : null}
          {logsQuery.data?.length === 0 ? <p className="font-sans text-sm text-slate-500">No logs recorded for this run yet.</p> : null}
          {logsQuery.data?.map((log) => (
            <div
              key={log.id}
              className={`rounded-2xl border px-3 py-3 ${
                log.level === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {log.level.toUpperCase()} {log.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
