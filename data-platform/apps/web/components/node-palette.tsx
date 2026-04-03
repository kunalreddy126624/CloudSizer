"use client";

import type { PipelineNodeType } from "@data-platform/types";

import { nodeCatalog } from "@data-platform/designer-core";

const groups = ["source", "transform", "sink"] as const;

export function NodePalette({ onAdd }: { onAdd(type: PipelineNodeType): void }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Node Palette</p>
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-slate-800">{group}s</h3>
            <div className="space-y-2">
              {nodeCatalog
                .filter((item) => item.category === group)
                .map((item) => (
                  <button
                    key={item.type}
                    onClick={() => onAdd(item.type)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50"
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
