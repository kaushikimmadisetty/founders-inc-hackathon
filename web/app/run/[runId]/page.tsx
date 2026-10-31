"use client";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { Director } from "@/components/Director";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, error } = useRun(runId);
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink">
      {error && !run && <p className="text-bad">Backend unreachable: {error}</p>}
      <Director key={runId} run={run} />
    </main>
  );
}
