"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RunState, SimReport, CriticVerdict } from "@/lib/types";
import { AssemblyViewer } from "./Robot3D";
import { Viewer3D } from "./Viewer3D";
import { BuildPack } from "./BuildPack";
import { TweakBox } from "./TweakBox";

/** Sequences a run into one centre-stage scene at a time. Stages are derived
 *  from run state; each auto-advances after its duration once its data exists. */

type Stage =
  | { kind: "plan" }
  | { kind: "parts" }
  | { kind: "assemble"; iteration: number; verdict?: CriticVerdict }
  | { kind: "sim"; report: SimReport }
  | { kind: "verdict"; report: SimReport; verdict: CriticVerdict }
  | { kind: "done" };

const TEMPLATE_LABEL: Record<string, string> = { diff_drive_rover: "2-wheel rover", mecanum_base: "4-wheel mecanum base", mecanum_arm: "mecanum base + 3-DOF arm" };

function stagesFor(run: RunState | null): Stage[] {
  const s: Stage[] = [{ kind: "plan" }, { kind: "parts" }, { kind: "assemble", iteration: 1 }];
  if (!run) return s;
  run.reports.forEach((r, i) => {
    s.push({ kind: "sim", report: r });
    const v = run.critic_history[i];
    if (!r.passed && v) {
      s.push({ kind: "verdict", report: r, verdict: v });
      s.push({ kind: "assemble", iteration: r.iteration + 1, verdict: v });
    }
  });
  if (run.status === "passed" || run.status === "failed") s.push({ kind: "done" });
  return s;
}

function ready(stage: Stage, run: RunState | null): boolean {
  if (!run) return false;
  switch (stage.kind) {
    case "plan": return Boolean(run.spec);
    case "parts": return Boolean(run.parts);
    case "assemble": return Boolean(run.parts && run.body);
    default: return true;
  }
}

// seconds each stage holds once ready (assembly ends on its own animation)
const HOLD: Record<Stage["kind"], number> = { plan: 4, parts: 7, assemble: 10, sim: 9, verdict: 5, done: 1e9 };

export function Director({ run }: { run: RunState | null }) {
  const stages = useMemo(() => stagesFor(run), [run]);
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);
  const stage = stages[Math.min(idx, stages.length - 1)];
  const isReady = ready(stage, run);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!auto || !isReady || stage.kind === "assemble") return;
    const last = idx >= stages.length - 1;
    if (last) return;
    timer.current = setTimeout(() => setIdx((i) => Math.min(i + 1, stages.length - 1)), HOLD[stage.kind] * 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [idx, auto, isReady, stage.kind, stages.length]);

  const next = () => setIdx((i) => Math.min(i + 1, stages.length - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col gap-4">
      <div className="flex-1">
        {!isReady ? <Waiting stage={stage} run={run} /> : <StageView stage={stage} run={run!} onAssembled={() => auto && next()} />}
      </div>
      <StepBar stages={stages} idx={idx} setIdx={setIdx} auto={auto} setAuto={setAuto} prev={prev} next={next} run={run} />
    </div>
  );
}

function label(st: Stage): string {
  switch (st.kind) {
    case "plan": return "Plan";
    case "parts": return "Parts";
    case "assemble": return st.iteration > 1 ? `Rebuild ${st.iteration}` : "Assemble";
    case "sim": return `Sim ${st.report.iteration}`;
    case "verdict": return "Critic";
    case "done": return "Build pack";
  }
}

function StepBar({ stages, idx, setIdx, auto, setAuto, prev, next, run }: { stages: Stage[]; idx: number; setIdx: (i: number) => void; auto: boolean; setAuto: (b: boolean) => void; prev: () => void; next: () => void; run: RunState | null }) {
  const live = run && run.status !== "passed" && run.status !== "failed";
  return (
    <div className="panel flex flex-wrap items-center gap-2 px-4 py-3">
      <button onClick={prev} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-acc">←</button>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {stages.map((st, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${i === idx ? "bg-acc text-white" : i < idx ? "bg-line text-slate-200" : "border border-line text-slate-500"}`}>
            {label(st)}{st.kind === "sim" && (st.report.passed ? " ✓" : " ✕")}
          </button>
        ))}
        {live && <span className="ml-2 flex items-center gap-2 text-xs text-warn"><span className="h-2 w-2 animate-pulse rounded-full bg-warn" />agents working…</span>}
      </div>
      <button onClick={() => setAuto(!auto)} className={`rounded-lg border px-3 py-1 text-sm ${auto ? "border-acc text-acc" : "border-line text-slate-400"}`}>{auto ? "Auto-play on" : "Auto-play off"}</button>
      <button onClick={next} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-acc">→</button>
    </div>
  );
}

function Waiting({ stage, run }: { stage: Stage; run: RunState | null }) {
  const msg = !run ? "connecting…" : stage.kind === "plan" ? "Planner is reading your idea" : stage.kind === "parts" ? "Parts agent is choosing real components" : "Body agent is generating the chassis";
  return (
    <div className="panel flex h-full min-h-[60vh] flex-col items-center justify-center gap-4">
      <span className="h-4 w-4 animate-ping rounded-full bg-acc" />
      <p className="text-2xl text-slate-300">{msg}</p>
    </div>
  );
}

function StageView({ stage, run, onAssembled }: { stage: Stage; run: RunState; onAssembled: () => void }) {
  const H = "h-[68vh] min-h-[480px]";
  switch (stage.kind) {
    case "plan": return <PlanStage run={run} />;
    case "parts": return <PartsStage run={run} />;
    case "assemble":
      return (
        <div className="relative">
          <AssemblyViewer key={stage.iteration} spec={run.spec ?? null} parts={run.parts ?? null} body={run.body ?? null} board={run.board ?? null} status={run.status} className={H} onDone={onAssembled} />
          {stage.verdict && (
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-warn/40 bg-ink/80 px-5 py-3 backdrop-blur">
              <p className="text-xs uppercase tracking-widest text-warn">Rebuilding after attempt {stage.iteration - 1}</p>
              <p className="text-lg">{stage.verdict.instruction}</p>
            </div>
          )}
        </div>
      );
    case "sim":
      return <Viewer3D key={stage.report.iteration} report={stage.report} spec={run.spec ?? null} body={run.body ?? null} parts={run.parts} board={run.board} className={H} />;
    case "verdict":
      return (
        <div className="panel flex h-[68vh] min-h-[480px] flex-col items-center justify-center gap-6 px-10 text-center">
          <span className="pill bg-bad/20 text-bad">Attempt {stage.report.iteration} failed the sim gate</span>
          <p className="max-w-4xl text-4xl font-black leading-tight md:text-5xl">{stage.verdict.summary}</p>
          <p className="max-w-3xl text-xl text-slate-300">{stage.report.failure_detail}</p>
          <p className="pill border border-line text-slate-300">Routed to the {stage.verdict.route_to} agent</p>
        </div>
      );
    case "done": return <DoneStage run={run} />;
  }
}

function PlanStage({ run }: { run: RunState }) {
  const sp = run.spec!;
  const c = sp.constraints;
  return (
    <div className="panel flex h-[68vh] min-h-[480px] flex-col items-center justify-center gap-6 px-10 text-center">
      <p className="text-xs uppercase tracking-widest text-slate-400">Planner</p>
      <p className="max-w-4xl text-3xl text-slate-300">“{run.prompt}”</p>
      <p className="text-5xl font-black md:text-6xl">{TEMPLATE_LABEL[sp.template] ?? sp.template}</p>
      <p className="max-w-3xl text-xl text-slate-300">Test: {sp.task.description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="pill border border-line text-slate-300">max height {c.max_height_mm} mm</span>
        <span className="pill border border-line text-slate-300">budget ${c.budget_usd}</span>
        <span className="pill border border-line text-slate-300">max {c.max_mass_kg} kg</span>
        {sp.sensors.map((s) => <span key={s} className="pill border border-line text-slate-300">{s.replace(/_/g, " ")}</span>)}
      </div>
      <p className="text-slate-500">{sp.rationale}</p>
    </div>
  );
}

function PartsStage({ run }: { run: RunState }) {
  const parts = run.parts!.parts;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= parts.length ? n : n + 1)), 450);
    return () => clearInterval(id);
  }, [parts.length]);
  const total = parts.slice(0, shown).reduce((a, p) => a + p.unit_price_usd * p.qty, 0);
  return (
    <div className="panel flex h-[68vh] min-h-[480px] flex-col px-8 py-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Parts agent · real components{parts.some((p) => p.source === "firecrawl") ? " · prices verified live via Firecrawl" : ""}</p>
          <p className="text-3xl font-bold">{shown} of {parts.length} parts</p>
        </div>
        <p className="text-5xl font-black">${total.toFixed(2)}</p>
      </div>
      <div className="mt-6 grid flex-1 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {parts.slice(0, shown).map((p, i) => (
          <div key={p.role + p.name} className="animate-[fadein_.4s_ease-out] rounded-xl border border-line bg-ink/60 p-4" style={{ animationDelay: `${i * 0}ms` }}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-acc">{p.role.replace(/_/g, " ")}</p>
              {p.source === "firecrawl" && (p.in_stock === false
                ? <span className="rounded-full bg-bad/20 px-2 py-0.5 text-[10px] font-semibold text-bad">out of stock</span>
                : <span className="rounded-full bg-ok/20 px-2 py-0.5 text-[10px] font-semibold text-ok">live price · {p.vendor}</span>)}
            </div>
            <p className="mt-1 text-lg font-semibold leading-tight">{p.qty}× {p.name}</p>
            <p className="mt-2 text-sm text-slate-400">{p.mass_g} g{p.stall_torque_nm ? ` · ${p.stall_torque_nm} N·m` : ""}{p.rated_rpm ? ` · ${p.rated_rpm} rpm` : ""}</p>
            <p className="mt-1 text-xl font-bold">${(p.unit_price_usd * p.qty).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoneStage({ run }: { run: RunState }) {
  const last = run.reports.at(-1);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className={`panel px-6 py-5 ${run.status === "passed" ? "border-ok/40 bg-ok/10" : "border-bad/40 bg-bad/10"}`}>
          <p className={`text-xs uppercase tracking-widest ${run.status === "passed" ? "text-ok" : "text-bad"}`}>Sim gate</p>
          <p className="text-3xl font-black">{run.status === "passed" ? `Passed on attempt ${last?.iteration} in ${last?.metrics.time_s.toFixed(1)} s. BOM $${run.parts?.total_usd.toFixed(0)}.` : `Closest design still fails: ${last?.failure_detail}`}</p>
        </div>
        {last && <Viewer3D report={last} spec={run.spec ?? null} body={run.body ?? null} parts={run.parts} board={run.board} className="h-[48vh] min-h-[360px]" />}
        <TweakBox run={run} />
      </div>
      <BuildPack run={run} />
    </div>
  );
}
