"use client";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server"; // typed api arrives with `npx convex dev` codegen; anyApi keeps the build green without a deployment
import { AgentEvent, AgentName, RunState } from "@/lib/types";

const DOT: Record<string, string> = { start: "bg-acc", progress: "bg-slate-400", done: "bg-ok", error: "bg-bad" };
const CONVEX_ON = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export function AgentLane(props: { name: AgentName; title: string; runId: string; run: RunState | null }) {
  return CONVEX_ON ? <LiveLane {...props} /> : <Lane {...props} events={[]} />;
}

function LiveLane(props: { name: AgentName; title: string; runId: string; run: RunState | null }) {
  const events = useQuery(anyApi.agentEvents.forRun, { runId: props.runId }) as AgentEvent[] | undefined;
  return <Lane {...props} events={events ?? []} />;
}

function Lane({ name, title, run, events }: { name: AgentName; title: string; runId: string; run: RunState | null; events: AgentEvent[] }) {
  const mine = events.filter((e) => e.agent === name).slice(-12);
  const last = mine.at(-1);
  return (
    <div className="panel flex min-h-[240px] flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {last && <span className={`h-3 w-3 rounded-full ${DOT[last.kind]}`} />}
      </div>
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
        {mine.length === 0 && <Summary name={name} run={run} />}
        {mine.map((e, i) => (
          <div key={i} className="flex gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
            <p className={e.kind === "error" ? "text-bad" : "text-slate-700"}>{e.message}</p>
          </div>
        ))}
      </div>
      <Preview name={name} run={run} />
    </div>
  );
}

/** Fallback when Convex is not configured: render from polled run state. */
function Summary({ name, run }: { name: AgentName; run: RunState | null }) {
  if (!run) return <p className="text-slate-600">waiting…</p>;
  if (name === "parts" && run.parts) return <ul className="space-y-1">{run.parts.parts.map((p) => <li key={p.role + p.name} className="flex justify-between gap-2"><span className="truncate">{p.qty}× {p.name}</span><span className="text-slate-600">${(p.unit_price_usd * p.qty).toFixed(2)}</span></li>)}</ul>;
  if (name === "body" && run.body) return <p>Chassis {run.body.dims_mm.map((d) => d.toFixed(0)).join(" × ")} mm, {run.body.chassis_mass_g.toFixed(0)} g</p>;
  if (name === "board" && run.board) return <p>{run.board.outline_mm.join(" × ")} mm carrier, {run.board.bom_lines.length} BOM lines <span className="text-slate-600">({run.board.provider})</span></p>;
  if (name === "brain" && run.brain) return <p>controller.py ({run.brain.origin}) · {run.brain.static_check_msg}</p>;
  return <p className="text-slate-600">{run.status === "planning" ? "planning…" : "working…"}</p>;
}

function Preview({ name, run }: { name: AgentName; run: RunState | null }) {
  if (!run) return null;
  if (name === "board" && run.board?.render_png_url) return <img src={run.board.render_png_url} alt="PCB render" className="mt-3 w-full rounded-lg border border-line" />;
  if (name === "brain" && run.brain) return <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-ink p-2 text-sm leading-tight text-slate-700">{run.brain.source.slice(0, 600)}</pre>;
  if (name === "parts" && run.parts) return <p className="mt-3 text-right text-lg font-bold">${run.parts.total_usd.toFixed(2)} <span className="text-sm font-normal text-slate-600">· {run.parts.total_mass_g.toFixed(0)} g</span></p>;
  if (name === "body" && run.body) return <p className="mt-3 text-slate-600">Wheels Ø{run.body.wheel_diameter_mm} mm</p>;
  return null;
}
