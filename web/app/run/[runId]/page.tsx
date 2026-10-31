"use client";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { Director } from "@/components/Director";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, error } = useRun(runId);
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2"><span className="logo-mark">R</span><span className="font-serif text-2xl">RoboForge</span></Link>
        <div className="min-w-0 flex-1 border-l border-line pl-4">
          <p className="truncate text-sm text-slate-700">{run?.prompt ?? "…"}</p>
          {run?.modification && <p className="text-sm text-warn">Revision: “{run.modification}”</p>}
        </div>
        <div className="flex items-center gap-3">
          {run && <span className="pill border border-line text-slate-700">Attempt {Math.max(run.iteration, 1)} of 3</span>}
          <StatusPill status={run?.status} />
        </div>
      </header>
      {error && !run && <p className="text-bad">Backend unreachable: {error}</p>}
      <Director key={runId} run={run} />
    </main>
  );
}
