"use client";

import Editor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";

import { mockPipeline } from "@/lib/mock-data";

const sampleSql = `select order_id, amount, ordered_at\nfrom raw.sales_orders\nwhere ordered_at >= current_date - interval '1 day';`;
const sampleNotebook = `# Daily Sales Notebook\n\n1. Inspect ingestion health\n2. Sample transformed records\n3. Review publish validation`;

export function EditorTabs() {
  return (
    <Tabs.Root defaultValue="overview" className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <Tabs.List className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
        {[
          ["overview", "Workspace Overview"],
          ["pipeline", "Pipeline JSON"],
          ["sql", "SQL Artifact"],
          ["notebook", "Notebook"]
        ].map(([value, label]) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-slate-600 data-[state=active]:border-teal-200 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-800"
          >
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="overview" className="grid gap-4 p-5 lg:grid-cols-3">
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Repository</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">analytics-platform</h3>
          <p className="mt-2 text-sm text-slate-600">Databricks-style workspace with repos, artifacts, versioned pipelines, and runs.</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{mockPipeline.name}</h3>
          <p className="mt-2 text-sm text-slate-600">{mockPipeline.description}</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Execution</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">Manual runner ready</h3>
          <p className="mt-2 text-sm text-slate-600">The control plane persists pipelines and runs now, and is structured to compile into Airflow or Prefect later.</p>
        </section>
      </Tabs.Content>
      <Tabs.Content value="pipeline" className="p-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <Editor height="480px" defaultLanguage="json" value={JSON.stringify(mockPipeline.spec, null, 2)} options={{ minimap: { enabled: false } }} />
        </div>
      </Tabs.Content>
      <Tabs.Content value="sql" className="p-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <Editor height="480px" defaultLanguage="sql" value={sampleSql} options={{ minimap: { enabled: false } }} />
        </div>
      </Tabs.Content>
      <Tabs.Content value="notebook" className="p-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <Editor height="480px" defaultLanguage="markdown" value={sampleNotebook} options={{ minimap: { enabled: false } }} />
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}
