import type { TreeNode } from "@data-platform/types";

interface ExplorerTreeProps {
  nodes: TreeNode[];
  selectedPath?: string;
  onSelect(path: string): void;
}

export function ExplorerTree({ nodes, selectedPath, onSelect }: ExplorerTreeProps) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <ExplorerNode key={node.id} node={node} selectedPath={selectedPath} onSelect={onSelect} depth={0} />
      ))}
    </div>
  );
}

function ExplorerNode({
  node,
  selectedPath,
  onSelect,
  depth
}: {
  node: TreeNode;
  selectedPath?: string;
  onSelect(path: string): void;
  depth: number;
}) {
  return (
    <div>
      <button
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${selectedPath === node.path ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <span className="mr-2 text-xs uppercase text-slate-400">{node.kind === "folder" ? "DIR" : node.artifactType}</span>
        {node.name}
      </button>
      {node.children?.length ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <ExplorerNode key={child.id} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
