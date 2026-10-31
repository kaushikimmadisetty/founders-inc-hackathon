"use client";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { StatusPill } from "@/components/StatusPill";
import { Director } from "@/components/Director";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, error } = useRun(runId);
  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <p className="truncate text-lg text-slate-300 md:text-xl">{run?.prompt ?? "…"}</p>
          {run?.modification && <p className="text-sm text-warn">Revision: “{run.modification}”</p>}
        </div>
        <div className="flex items-center gap-3">
          {run && <span className="pill border border-line text-slate-300">Attempt {Math.max(run.iteration, 1)} of 3</span>}
          <StatusPill status={run?.status} />
        </div>
      </header>
      {error && !run && <p className="text-bad">Backend unreachable: {error}</p>}
      <Director run={run} />
    </main>
  );
}
