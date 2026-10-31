"use client";
import { useEffect, useRef, useState } from "react";
import { BACKEND } from "@/lib/types";
import { useRun } from "@/lib/useRun";
import { Director } from "@/components/Director";

/** Kiosk screen for the projector. Idles on the phone number; the moment any
 *  text (or web prompt) starts a run, it switches to that run's stage flow.
 *  A newer run always takes over. */
type Recent = { run_id: string; prompt: string; status: string; source: string; created_ms: number };

export default function LivePage() {
  const [active, setActive] = useState<Recent | null>(null);
  const { run, error } = useRun(active?.run_id ?? "", 1200);
  const [feedError, setFeedError] = useState(false);
  const seenAt = useRef<number>(Date.now());
  const phone = process.env.NEXT_PUBLIC_PHOTON_NUMBER ?? "(number coming)";

  // watch for new runs
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/runs?limit=1`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!r.ok) throw new Error("Runs unavailable");
        const d = await r.json();
        if (alive) setFeedError(false);
        const latest: Recent | undefined = d.runs?.[0];
        if (alive && latest && latest.created_ms >= seenAt.current - 5000 && latest.run_id !== active?.run_id) {
          setActive(latest);
        }
      } catch { if (alive) setFeedError(true); }
      if (alive) timer = setTimeout(tick, 1200);
    };
    tick();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [active?.run_id]);

  if (!active) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-8 text-center">
        <p className="pill border border-line text-slate-500">Live · waiting for a text</p>
        <h1 className="text-5xl font-black leading-tight md:text-7xl">Text a robot idea to</h1>
        <p className="max-w-full break-words text-4xl font-black tracking-tight md:text-8xl">{phone}</p>
        {feedError && <p role="status" className="text-sm text-slate-600">Cannot reach the robot backend. Retrying…</p>}
        <p className="max-w-2xl text-2xl text-slate-500">The screen takes over the moment your message lands. Real parts, physics-tested, build pack back to your phone.</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink">
      {(error || feedError) && <p role="status" className="bg-white px-4 py-2 text-sm text-slate-600">{error || "Cannot reach the robot backend. Retrying…"}</p>}
      <Director key={active.run_id} run={run} />
    </main>
  );
}
