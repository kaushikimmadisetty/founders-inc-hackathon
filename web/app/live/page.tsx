"use client";
import { useEffect, useRef, useState } from "react";
import { BACKEND, RunState } from "@/lib/types";
import { Director } from "@/components/Director";
import { StatusPill } from "@/components/StatusPill";

/** Kiosk screen for the projector. Idles on the phone number; the moment any
 *  text (or web prompt) starts a run, it switches to that run's stage flow.
 *  A newer run always takes over. */
type Recent = { run_id: string; prompt: string; status: string; source: string; created_ms: number };

export default function LivePage() {
  const [active, setActive] = useState<Recent | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const seenAt = useRef<number>(Date.now());
  const phone = process.env.NEXT_PUBLIC_PHOTON_NUMBER ?? "(number coming)";

  // watch for new runs
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/runs?limit=1`, { cache: "no-store" });
        const d = await r.json();
        const latest: Recent | undefined = d.runs?.[0];
        if (alive && latest && latest.created_ms >= seenAt.current - 5000 && latest.run_id !== active?.run_id) {
          setActive(latest); setRun(null);
        }
      } catch { /* backend asleep, keep idling */ }
      if (alive) setTimeout(tick, 1200);
    };
    tick();
    return () => { alive = false; };
  }, [active?.run_id]);

  // poll the active run
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/runs/${active.run_id}`, { cache: "no-store" });
        if (r.ok && alive) setRun(await r.json());
      } catch { /* retry */ }
      if (alive) setTimeout(tick, 1200);
    };
    tick();
    return () => { alive = false; };
  }, [active?.run_id]);

  if (!active) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-8 text-center">
        <p className="pill border border-line text-slate-500">Live · waiting for a text</p>
        <h1 className="text-5xl font-black leading-tight md:text-7xl">Text a robot idea to</h1>
        <p className="text-6xl font-black tracking-tight md:text-8xl">{phone}</p>
        <p className="max-w-2xl text-2xl text-slate-500">The screen takes over the moment your message lands. Real parts, physics-tested, build pack back to your phone.</p>
        <span className="mt-6 h-3 w-3 animate-ping rounded-full bg-acc" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-slate-500">{active.source === "imessage" ? "Text just received" : "Web prompt"}</p>
          <p className="truncate text-xl md:text-2xl">{active.prompt}</p>
        </div>
        <div className="flex items-center gap-3">
          {run && <span className="pill border border-line">Attempt {Math.max(run.iteration, 1)} of 3</span>}
          <StatusPill status={run?.status} />
        </div>
      </header>
      <Director key={active.run_id} run={run} />
    </main>
  );
}
