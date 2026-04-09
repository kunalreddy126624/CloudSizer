"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ExplorerTree } from "@data-platform/ui";

import { getRepoTree, getRepos } from "@/lib/api";

function filterTree(node: any, term: string): any | null {
  if (!term) return node;
  const normalized = term.toLowerCase();
  const children = (node.children ?? []).map((child: any) => filterTree(child, term)).filter(Boolean);
  const matches = node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized);
  if (matches || children.length > 0) {
    return { ...node, children };
  }
  return null;
}

export function WorkspaceExplorer() {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [search, setSearch] = useState("");
  const reposQuery = useQuery({ queryKey: ["repos"], queryFn: getRepos });
  const selectedRepoId = reposQuery.data?.[0]?.id;
  const treeQuery = useQuery({
    queryKey: ["repo-tree", selectedRepoId],
    queryFn: () => getRepoTree(selectedRepoId ?? ""),
    enabled: Boolean(selectedRepoId)
  });

  const filtered = useMemo(() => filterTree(treeQuery.data, search), [search, treeQuery.data]);
  const repo = reposQuery.data?.[0];

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-platform">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{repo?.name ?? "Loading repository..."}</h2>
        <p className="text-sm text-slate-500">
          {reposQuery.error instanceof Error ? reposQuery.error.message : repo?.description ?? "Repository explorer"}
        </p>
      </div>
      <label className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <Search className="h-4 w-4" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search repo tree"
          className="w-full bg-transparent outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {treeQuery.isLoading ? <p className="text-sm text-slate-500">Loading repository tree...</p> : null}
        {treeQuery.error instanceof Error ? <p className="text-sm text-rose-600">{treeQuery.error.message}</p> : null}
        {filtered ? <ExplorerTree nodes={[filtered]} selectedPath={selectedPath} onSelect={setSelectedPath} /> : null}
      </div>
    </aside>
  );
}
