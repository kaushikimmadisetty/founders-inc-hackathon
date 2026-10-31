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
    const controller = new AbortController();
    setRun(null); setError(null);
    if (!runId) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/runs/${encodeURIComponent(runId)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (r.status === 404) { if (alive) setError("Robot not found. Choose a robot from Explore or start a new build."); return; }
        if (!r.ok) throw new Error("Backend unavailable");
        const data = (await r.json()) as RunState;
        if (alive) { setRun(data); setError(null); }
        if (alive && data.status !== "passed" && data.status !== "failed") timer = setTimeout(tick, intervalMs);
      } catch {
        if (alive) { setError("Cannot reach the robot backend. Retrying…"); timer = setTimeout(tick, intervalMs * 2); }
      }
    };
    tick();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [runId, intervalMs]);
  return { run, error };
}
