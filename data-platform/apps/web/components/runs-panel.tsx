"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getPipelineRuns } from "@/lib/api";

export function RunsPanel({ pipelineId }: { pipelineId: string }) {
  const runsQuery = useQuery({
    queryKey: ["pipeline-runs", pipelineId],
    queryFn: () => getPipelineRuns(pipelineId)
  });

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Run History</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Recent executions</h3>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {runsQuery.isLoading ? <p className="text-sm text-slate-500">Loading runs...</p> : null}
        {runsQuery.error instanceof Error ? <p className="text-sm text-rose-600">{runsQuery.error.message}</p> : null}
        {runsQuery.data?.length === 0 ? <p className="text-sm text-slate-500">No runs have been recorded for this pipeline yet.</p> : null}
        {runsQuery.data?.map((run) => (
          <Link
            key={run.id}
            href={`/runs/${run.id}`}
            className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-sm transition hover:border-teal-300 hover:bg-teal-50"
          >
            <div>
              <p className="font-semibold text-slate-900">{run.id}</p>
              <p className="text-slate-500">Version {run.version}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">{run.state}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
