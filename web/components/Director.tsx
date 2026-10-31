"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RunState, SimReport, CriticVerdict } from "@/lib/types";
import { AssemblyViewer } from "./Robot3D";
import { Viewer3D } from "./Viewer3D";
import { PartsPanel } from "./PartsPanel";
import { TweakBox } from "./TweakBox";
import { CADHeader } from "./CADHeader";
import { useViewport, WorkspaceToolbar } from "./ViewportControls";

type Stage =
  | { kind: "plan" }
  | { kind: "parts" }
  | { kind: "assemble"; iteration: number; verdict?: CriticVerdict }
  | { kind: "sim"; report: SimReport }
  | { kind: "verdict"; report: SimReport; verdict: CriticVerdict }
  | { kind: "done" };

function stageKey(s: Stage) { return `${s.kind}:${"iteration" in s ? s.iteration : "report" in s ? s.report.iteration : ""}`; }
function stagesFor(run: RunState | null): Stage[] {
  const stages: Stage[] = [{ kind: "plan" }];
  if (!run) return stages;
  if (run.parts) stages.push({ kind: "parts" });
  if (run.parts && run.body) stages.push({ kind: "assemble", iteration: 1 });
  run.reports.forEach((report, i) => {
    stages.push({ kind: "sim", report });
    const verdict = run.critic_history[i];
    if (!report.passed && verdict) {
      stages.push({ kind: "verdict", report, verdict });
      if (run.iteration > report.iteration && run.parts && run.body) stages.push({ kind: "assemble", iteration: report.iteration + 1, verdict });
    }
  });
  if (run.status === "passed" || run.status === "failed") stages.push({ kind: "done" });
  return stages;
}

/** A data-driven workbench: no presentation clocks, cycling, or auto-play. */
export function Director({ run }: { run: RunState | null }) {
  const stages = useMemo(() => stagesFor(run), [run]);
  const latest = stages[stages.length - 1];
  const milestone = stageKey(latest);
  const [browse, setBrowse] = useState<{ milestone: string; key: string } | null>(null);
  // Browsing is stable across identical polls. Only a new backend milestone
  // moves the workbench forward, including completion on the final sim frame.
  const desiredStage = (browse?.milestone === milestone ? stages.find(s => stageKey(s) === browse.key) : null) ?? latest;
  const displayedKey = useStageTransition(stageKey(desiredStage));
  const stage = stages.find(s => stageKey(s) === displayedKey) ?? desiredStage;
  const idx = stages.indexOf(stage);
  const played = useRef(new Set<number>());
  const [selected, setSelected] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<{ milestone: string; build: boolean } | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const controls = useViewport();
  const showBuildPack = panelMode?.milestone === milestone ? panelMode.build : stage.kind === "done";
  const choosePanel = (build: boolean) => { setPanelMode({ milestone, build }); setPanelVisible(true); };
  const select = (id: string | null) => { setSelected(id); if (id) choosePanel(false); };
  const report = stage.kind === "sim" || stage.kind === "verdict" ? stage.report : stage.kind === "done" ? run?.reports.at(-1) : undefined;
  const finished = run?.status === "passed" || run?.status === "failed";
  const review = stage.kind === "verdict" || stage.kind === "assemble" ? stage.verdict : undefined;
  const jump = (index: number) => setBrowse({ milestone, key: stageKey(stages[index]) });
  return <>
    <CADHeader run={run} onBuildPack={() => choosePanel(true)} />
    <div className={`cad-workspace ${panelVisible ? "" : "panel-hidden"}`}>
      <WorkspaceToolbar controls={controls} onClear={() => select(null)} onBuildPack={() => choosePanel(true)} panelVisible={panelVisible} onTogglePanel={() => setPanelVisible(v => !v)} />
      <div className="cad-viewport">
        <div className="scene-layer" key={stageKey(stage)}>
          {report ? <Viewer3D report={report} spec={run?.spec ?? null} body={run?.body ?? null} parts={run?.parts} board={run?.board} className="h-full" viewport={controls} still={finished || stage.kind !== "sim" || played.current.has(report.iteration)} onPlaybackEnd={() => { played.current.add(report.iteration); }} selected={selected} onSelect={select} />
            : <AssemblyViewer spec={run?.spec ?? null} parts={run?.parts ?? null} body={run?.body ?? null} board={run?.board ?? null} className="h-full" viewport={controls} selected={selected} onSelect={select} />}
        </div>
        {!run && <p className="viewport-message">Connecting to your robot…</p>}
        {run && !run.parts && <p className="viewport-message">Planner is reading your idea</p>}
        {run && <div className="cad-ask"><TweakBox run={run} /></div>}
        <p className="cad-attribution">From {run?.spec?.template.replace(/_/g, " ") ?? "RoboForge"} · CC-BY parts</p>
        <div className="cad-readout"><details><summary>Settings</summary><div className="settings-content">Drag to orbit<br />Right-drag to pan<br />Scroll to zoom<br />World units: millimetres</div></details><span title="Grid readout; parts are not editable in this viewer">Snap grid 1.0 mm</span></div>
      </div>
      {panelVisible && <PartsPanel run={run} selected={selected} onSelect={select} buildPack={showBuildPack} onCloseBuildPack={() => choosePanel(false)}>
        {review && <section key={stageKey(stage)} className="review-card stage-fade"><p className="eyebrow">{stage.kind === "verdict" ? "Critic review" : "Revised design"}</p><h2 className="font-serif text-3xl">{review.summary}</h2><p className="mt-3 text-sm text-slate-600">{review.instruction}</p><p className="mt-3 text-sm">Route → {review.route_to} agent</p></section>}
        {stage.kind === "plan" && run?.spec && <section className="review-card stage-fade"><p className="eyebrow">Design intent</p><h2 className="font-serif text-2xl">{run.spec.template.replace(/_/g, " ")}</h2><p className="mt-2 text-sm text-slate-600">{run.spec.task.description}</p></section>}
      </PartsPanel>}
      <nav className="step-tape" aria-label="Run stages">
        <button aria-label="Previous stage" disabled={idx === 0} onClick={() => jump(idx - 1)}>←</button>
        <div className="stage-steps">{stages.map((s, i) => <button key={stageKey(s)} aria-current={i === idx ? "step" : undefined} onClick={() => jump(i)} className={i === idx ? "current" : ""}>{i < stages.length - 1 && <span className="mr-1 text-slate-500">✓</span>}{label(s)}{s.kind === "sim" && <span className={`ml-1 ${s.report.passed ? "text-ok" : "text-bad"}`}>{s.report.passed ? "pass" : "fail"}</span>}</button>)}</div>
        <button aria-label="Next stage" disabled={idx === stages.length - 1} onClick={() => jump(idx + 1)}>→</button>
      </nav>
    </div>
  </>;
}
function label(stage: Stage) {
  switch (stage.kind) {
    case "plan": return "Plan";
    case "parts": return "Parts";
    case "assemble": return stage.iteration > 1 ? `Rebuild ${stage.iteration}` : "Assemble";
    case "sim": return `Sim ${stage.report.iteration}`;
    case "verdict": return "Critic";
    case "done": return "Build pack";
  }
}

/** Native compositor crossfade; no timer and no duplicate live 3D canvases. */
function useStageTransition(nextKey: string) {
  const [displayed, setDisplayed] = useState(nextKey);
  const current = useRef(nextKey);
  useEffect(() => {
    if (current.current === nextKey) return;
    current.current = nextKey;
    if ("startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const transition = document.startViewTransition(() => { flushSync(() => setDisplayed(nextKey)); });
      void transition.ready.catch(() => { /* superseded or unsupported snapshot */ });
      // A newer backend milestone can supersede an in-flight fade.
      return () => transition.skipTransition();
    }
    setDisplayed(nextKey);
  }, [nextKey]);
  return displayed;
}
