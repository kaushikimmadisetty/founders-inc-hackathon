"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RunState, SimReport, CriticVerdict } from "@/lib/types";
import { AssemblyViewer } from "./Robot3D";
import { Viewer3D } from "./Viewer3D";
import { BuildPack } from "./BuildPack";
import { PartsPanel } from "./PartsPanel";
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
  const [assembledAt, setAssembledAt] = useState<number | null>(null);
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

  // Assembly may finish before the backend publishes its first report. Keep
  // completion latched so polling or resuming auto-play can advance later.
  useEffect(() => {
    if (auto && isReady && stage.kind === "assemble" && assembledAt === idx && idx < stages.length - 1) {
      setAssembledAt(null); setIdx(i => i + 1);
    }
  }, [auto, isReady, stage.kind, assembledAt, idx, stages.length]);
  const jump = (i: number) => { setAssembledAt(null); setIdx(i); };
  const next = () => jump(Math.min(idx + 1, stages.length - 1));
  const prev = () => jump(Math.max(idx - 1, 0));

  const [selected, setSelected] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState(0);
  useEffect(() => {
    if (stage.kind !== "parts") return;
    setSpotlight(0);
    const id = setInterval(() => setSpotlight(i => (i + 1) % Math.max(1, run?.parts?.parts.length ?? 1)), 650);
    return () => clearInterval(id);
  }, [stage.kind, run?.parts?.parts.length]);
  const report = stage.kind === "sim" || stage.kind === "verdict" ? stage.report : stage.kind === "done" ? run?.reports.at(-1) : undefined;
  const focusLeft = stage.kind !== "sim" && stage.kind !== "assemble" || (stage.kind === "assemble" && !!stage.verdict);
  return (
    <div className="cad-workspace">
      <div className="cad-viewport">
        {report ? <Viewer3D key={`sim-${report.iteration}`} report={report} spec={run?.spec ?? null} body={run?.body ?? null} parts={run?.parts} board={run?.board} className="h-full" focusLeft={focusLeft} selected={selected} onSelect={setSelected} />
          : <AssemblyViewer key={stage.kind === "assemble" ? `assembly-${stage.iteration}` : "preview"} spec={run?.spec ?? null} parts={run?.parts ?? null} body={run?.body ?? null} board={run?.board ?? null} status={run?.status} className="h-full" focusLeft={focusLeft} preview={stage.kind !== "assemble"} selected={selected} onSelect={setSelected} onDone={() => { if (stage.kind === "assemble" && isReady) setAssembledAt(idx); }} />}
        <div className="stage-overlay" aria-live="polite">
          {!isReady ? <div className="floating-card"><p className="eyebrow">Agents at work</p><h2 className="font-serif text-3xl">{!run ? "Connecting to the workshop…" : stage.kind === "plan" ? "Reading your idea…" : stage.kind === "parts" ? "Sourcing real components…" : "Generating the chassis…"}</h2></div>
          : stage.kind === "plan" && run?.spec ? <div className="floating-card"><p className="eyebrow">01 / Design intent</p><h2 className="font-serif text-4xl">{TEMPLATE_LABEL[run.spec.template]}</h2><p className="mt-3 text-slate-600">{run.spec.task.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="pill bg-ink">≤ {run.spec.constraints.max_height_mm} mm</span><span className="pill bg-ink">${run.spec.constraints.budget_usd} budget</span></div><p className="mt-3 text-sm text-slate-600">{run.spec.rationale}</p></div>
          : stage.kind === "parts" ? <div className="floating-card"><p className="eyebrow">02 / Sourced for this build</p><h2 className="font-serif text-4xl">Real parts. Ready to assemble.</h2><p className="mt-3 text-slate-600">{run?.parts?.parts.length} components · ${run?.parts?.total_usd.toFixed(2)} BOM</p><p className="mt-2 text-sm text-slate-600">Select any part to inspect its specifications.</p></div>
          : stage.kind === "verdict" ? <div className="floating-card review-card"><p className="eyebrow text-bad">Attempt {stage.report.iteration} / Critic review</p><h2 className="text-4xl font-semibold tracking-tight text-bad">Needs a closer look.</h2><p className="mt-4 text-xl font-medium">{stage.verdict.summary}</p><p className="mt-3 text-slate-600">{stage.report.failure_detail}</p><div className="mt-4 rounded-xl bg-amber-50 p-4"><p className="text-sm font-semibold text-warn">Route → {stage.verdict.route_to} agent</p><p className="mt-2">{stage.verdict.instruction}</p></div><button onClick={next} className="mt-4 w-full rounded-xl bg-acc px-4 py-3 font-semibold text-white">Apply correction →</button></div>
          : stage.kind === "assemble" && stage.verdict ? <div className="floating-card"><p className="eyebrow text-warn">Rebuild / Attempt {stage.iteration}</p><h2 className="font-serif text-4xl">Correct. Assemble. Recheck.</h2><p className="mt-3">{stage.verdict.instruction}</p></div>
          : stage.kind === "sim" && report?.passed ? <div className="floating-card border-green-200"><p className="eyebrow text-ok">Physics verified / Attempt {report.iteration}</p><h2 className="text-5xl font-semibold text-ok">It works.</h2><p className="mt-3 text-slate-600">Target {report.metrics.reached_target ? "reached" : "checked"} in {report.metrics.time_s.toFixed(1)} s.</p></div>
          : stage.kind === "done" && run ? <div className="floating-card"><p className={`eyebrow ${run.status === "passed" ? "text-ok" : "text-bad"}`}>Simulation {run.status}</p><h2 className="font-serif text-4xl">{run.status === "passed" ? "From idea to build pack." : "A design worth another iteration."}</h2><p className="mt-2 text-slate-600">{run.status === "passed" ? `Passed on attempt ${report?.iteration}. Download your manufacturing files.` : report?.failure_detail}</p><div className="mt-4"><BuildPack run={run} /></div></div> : null}
        </div>
        {stage.kind === "sim" && report?.passed && <Confetti />}
        {run && <div className="cad-ask"><TweakBox run={run} /></div>}
        <div className="cad-readout"><details className="relative"><summary className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2">Settings</summary><div className="absolute bottom-12 right-0 w-56 rounded-xl border border-line bg-white p-4 shadow-lg">Orbit: drag<br />Pan: right-drag<br />Zoom: scroll<br /><span className="text-slate-600">World units: millimetres</span></div></details><span className="rounded-lg border border-line bg-white px-3 py-2">Scale 1 : 1 · mm</span></div>
      </div>
      <PartsPanel run={run} selected={selected} onSelect={setSelected} spotlight={stage.kind === "parts" ? spotlight : undefined} />
      <StepBar stages={stages} idx={idx} setIdx={jump} auto={auto} setAuto={setAuto} prev={prev} next={next} run={run} />
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
    <div className="step-tape panel flex items-center gap-2 px-3 py-2">
      <button aria-label="Previous stage" disabled={idx === 0} onClick={prev} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-acc">←</button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {stages.map((st, i) => (
          <button key={i} aria-current={i === idx ? "step" : undefined} onClick={() => setIdx(i)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${i === idx ? "bg-acc text-white" : i < idx ? "bg-slate-100 text-slate-700" : "border border-line text-slate-600"}`}>
            {i < idx && <span className="mr-1 text-ok">✓</span>}{label(st)}{st.kind === "sim" && (st.report.passed ? <span className="ml-1 rounded bg-white/90 px-1 text-ok">pass</span> : <span className="ml-1 rounded bg-white/90 px-1 text-bad">fail</span>)}
          </button>
        ))}
        {live && <span className="ml-2 hidden items-center gap-2 whitespace-nowrap text-sm text-warn xl:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-warn" />agents working…</span>}
      </div>
      <button onClick={() => setAuto(!auto)} className={`rounded-lg border px-3 py-1 text-sm ${auto ? "border-acc text-acc" : "border-line text-slate-600"}`}>{auto ? "Auto-play on" : "Auto-play off"}</button>
      <button aria-label="Next stage" disabled={idx === stages.length - 1} onClick={next} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-acc">→</button>
    </div>
  );
}

const CONFETTI = Array.from({ length: 60 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 12) * 0.12, dur: 2.4 + (i % 5) * 0.3, color: ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#e5e7eb"][i % 5], rot: (i * 53) % 360 }));

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {CONFETTI.map((c, i) => (
        <span key={i} className="absolute top-[-10px] block h-2.5 w-1.5 animate-[confetti_linear_forwards]"
          style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, transform: `rotate(${c.rot}deg)` }} />
      ))}
    </div>
  );
}
