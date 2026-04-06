export default function ConnectionsPage() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Connections</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Connection registry</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        Manage source and sink connection references here. The backend domain is modeled and ready for credential-backed implementations.
      </p>
    </div>
  );
}
