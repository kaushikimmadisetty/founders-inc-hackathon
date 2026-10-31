import { CriticVerdict, SimReport } from "@/lib/types";

export function CriticCallout({ verdict, passed, report }: { verdict?: CriticVerdict; passed?: boolean; report?: SimReport }) {
  if (passed && report) {
    return (
      <div className="panel border-ok/40 bg-ok/10 px-6 py-4">
        <p className="text-xs uppercase tracking-widest text-ok">Sim gate</p>
        <p className="text-2xl font-bold">Passed on attempt {report.iteration} in {report.metrics.time_s.toFixed(1)} s. BOM ${report.metrics.total_cost_usd.toFixed(0)}.</p>
      </div>
    );
  }
  if (!verdict) return null;
  return (
    <div className="panel border-warn/40 bg-warn/10 px-6 py-4">
      <p className="text-xs uppercase tracking-widest text-warn">Critic → {verdict.route_to} agent</p>
      <p className="text-2xl font-bold">{verdict.summary}</p>
      <p className="mt-1 text-slate-300">{verdict.instruction}</p>
    </div>
  );
}
