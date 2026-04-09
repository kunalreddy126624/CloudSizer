"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EditorTabs } from "@/components/editor-tabs";
import { getPipelineRuns, getPipelines } from "@/lib/api";

export default function WorkspacePage() {
  const pipelinesQuery = useQuery({ queryKey: ["pipelines"], queryFn: getPipelines });
  const primaryPipeline = pipelinesQuery.data?.[0];
  const runsQuery = useQuery({
    queryKey: ["pipeline-runs", primaryPipeline?.id],
    queryFn: () => getPipelineRuns(primaryPipeline?.id ?? ""),
    enabled: Boolean(primaryPipeline?.id)
  });
  const latestRun = runsQuery.data?.[0];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-platform">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Workspace</p>
          <h2 className="mt-2 text-3xl font-semibold">Build and operate data products from a single repository experience.</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-200">
            Browse repos, version pipeline artifacts, design DAGs visually, validate before publish, and trigger runs through a clean control plane.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={primaryPipeline ? `/pipelines/${primaryPipeline.id}` : "#"}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              Open Pipeline Designer
            </Link>
            <Link
              href={latestRun ? `/runs/${latestRun.id}` : "#"}
              className="rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Latest Run
            </Link>
          </div>
          {pipelinesQuery.error instanceof Error ? <p className="mt-4 text-sm text-rose-200">{pipelinesQuery.error.message}</p> : null}
          {runsQuery.error instanceof Error ? <p className="mt-2 text-sm text-rose-200">{runsQuery.error.message}</p> : null}
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated Plan</p>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-900">Phase 1</p>
              <p>Auth, pipeline CRUD, DAG designer, manual run, and run status pages.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Phase 2</p>
              <p>Scheduling, retries, alerts, secrets, and connector registry.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Phase 3</p>
              <p>Lineage, RBAC, multi-tenancy, autoscaling workers, and cost tracking.</p>
            </div>
          </div>
        </div>
      </section>
      <EditorTabs />
    </div>
  );
}
