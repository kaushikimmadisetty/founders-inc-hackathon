"use client";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { Director } from "@/components/Director";
import Link from "next/link";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, error } = useRun(runId);
  if (error && !run) return <main className="flex min-h-svh items-center justify-center p-6"><section className="panel max-w-lg p-6"><h1 className="font-serif text-3xl">{error.startsWith("Robot not found") ? "Robot not found" : "Connection unavailable"}</h1><p role="status" className="my-4 text-slate-600">{error}</p><Link href="/dashboard" className="pill border border-line">Browse robots</Link></section></main>;
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink">
      {error && <p role="status" className="bg-white px-4 py-2 text-sm text-slate-600">{error}</p>}
      <Director key={runId} run={run} />
    </main>
  );
}
