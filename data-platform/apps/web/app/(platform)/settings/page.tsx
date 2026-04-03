export default function SettingsPage() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Settings</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Platform settings</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        Environment defaults, schedules, secrets, and future RBAC settings are scaffolded for the next implementation phase.
      </p>
    </div>
  );
}
