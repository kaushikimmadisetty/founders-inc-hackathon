"use client";
import { useEffect, useState } from "react";
import { BACKEND, RunState } from "./types";

/** Polls the FastAPI backend for full run state. Convex drives the live lanes;
 *  this gives the rest (spec, parts, reports) and is the fallback if Convex is off. */
export function useRun(runId: string, intervalMs = 1500) {
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/runs/${runId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status}`);
        const data = (await r.json()) as RunState;
        if (alive) { setRun(data); setError(null); }
        if (alive && data.status !== "passed" && data.status !== "failed") timer = setTimeout(tick, intervalMs);
      } catch (e) {
        if (alive) { setError(String(e)); timer = setTimeout(tick, intervalMs * 2); }
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId, intervalMs]);
  return { run, error };
}
