import type { ValidationIssue } from "@data-platform/types";

export function ValidationList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">No validation issues.</div>;
  }
  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? issue.message}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-semibold">{issue.code}</div>
          <div>{issue.message}</div>
        </div>
      ))}
    </div>
  );
}
