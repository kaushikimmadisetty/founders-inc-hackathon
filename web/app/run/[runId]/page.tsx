"use client";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { AgentLane } from "@/components/AgentLane";
import { Viewer3D } from "@/components/Viewer3D";
import { BuildPack } from "@/components/BuildPack";
import { CriticCallout } from "@/components/CriticCallout";
import { StatusPill } from "@/components/StatusPill";
import { AssemblyViewer } from "@/components/Robot3D";
import { TweakBox } from "@/components/TweakBox";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, error } = useRun(runId);
  const latest = run?.reports.at(-1);
  const previous = run && run.reports.length > 1 ? run.reports.at(-2) : undefined;
  const lastVerdict = run?.critic_history.at(-1);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <header className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-slate-400">Prompt</p>
          <h1 className="truncate text-2xl font-bold md:text-3xl">{run?.prompt ?? "…"}</h1>
          {run?.modification && <p className="text-warn">Revision: “{run.modification}”</p>}
          {run?.spec && <p className="text-slate-400">{run.spec.template.replace(/_/g, " ")} · {run.spec.task.id.replace(/_/g, " ")} · {run.spec.rationale}</p>}
        </div>
        <div className="flex items-center gap-3">
          {run && <span className="pill border border-line text-slate-300">Attempt {Math.max(run.iteration, 1)} of 3</span>}
          <StatusPill status={run?.status} />
        </div>
      </header>

      {error && !run && <p className="text-bad">Backend unreachable: {error}</p>}

      {lastVerdict && run?.status !== "passed" && <CriticCallout verdict={lastVerdict} />}
      {run?.status === "passed" && latest && <CriticCallout passed report={latest} />}

      <section className="grid gap-4 lg:grid-cols-4">
        <AgentLane name="parts" title="Parts" runId={runId} run={run} />
        <AgentLane name="body" title="Body" runId={runId} run={run} />
        <AgentLane name="board" title="Board" runId={runId} run={run} />
        <AgentLane name="brain" title="Brain" runId={runId} run={run} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className={`grid gap-4 ${latest ? "md:grid-cols-2" : ""}`}>
            <AssemblyViewer spec={run?.spec ?? null} parts={run?.parts ?? null} body={run?.body ?? null} board={run?.board ?? null} status={run?.status} />
            {latest && <Viewer3D report={latest} spec={run?.spec ?? null} body={run?.body ?? null} parts={run?.parts} board={run?.board} />}
          </div>
          {previous && (
            <div className="grid gap-4 md:grid-cols-2">
              <Viewer3D report={previous} spec={run?.spec ?? null} body={run?.body ?? null} parts={run?.parts} board={run?.board} />
              <div className="panel flex flex-col justify-center gap-2 p-6 text-slate-300">
                <p className="text-xs uppercase tracking-widest text-slate-400">Why attempt {previous.iteration} failed</p>
                <p className="text-lg">{previous.failure_detail}</p>
                {run?.critic_history[previous.iteration - 1] && <p className="text-sm text-warn">{run.critic_history[previous.iteration - 1].instruction}</p>}
              </div>
            </div>
          )}
          {run && (run.status === "passed" || run.status === "failed") && <TweakBox run={run} />}
        </div>
        <BuildPack run={run} />
      </section>
    </main>
  );
}
