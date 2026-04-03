"use client";

import { nodeCatalogMap } from "@data-platform/designer-core";

import { useDesignerStore } from "@/stores/designer-store";

export function NodeInspector() {
  const spec = useDesignerStore((state) => state.spec);
  const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
  const updateNode = useDesignerStore((state) => state.updateNode);
  const updateNodeConfig = useDesignerStore((state) => state.updateNodeConfig);

  const selectedNode = spec.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inspector</p>
        <p className="mt-4 text-sm text-slate-500">Select a node on the canvas to edit configuration, retries, timeout, resources, and tags.</p>
      </section>
    );
  }

  const catalog = nodeCatalogMap[selectedNode.type];

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inspector</p>
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name</span>
          <input
            value={selectedNode.name}
            onChange={(event) => updateNode(selectedNode.id, { name: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Description</span>
          <textarea
            value={selectedNode.description}
            onChange={(event) => updateNode(selectedNode.id, { description: event.target.value })}
            className="min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
          />
        </label>
        {catalog.fields.map((field) => (
          <label className="block" key={field.key}>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                value={String(selectedNode.config[field.key] ?? "")}
                onChange={(event) => updateNodeConfig(selectedNode.id, field.key, event.target.value)}
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            ) : field.type === "select" ? (
              <select
                value={String(selectedNode.config[field.key] ?? "")}
                onChange={(event) => updateNodeConfig(selectedNode.id, field.key, event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={String(selectedNode.config[field.key] ?? "")}
                onChange={(event) => updateNodeConfig(selectedNode.id, field.key, event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}
