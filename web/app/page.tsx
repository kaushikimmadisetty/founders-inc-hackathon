"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BACKEND } from "@/lib/types";

const Hero3D = dynamic(() => import("@/components/Hero3D"), { ssr: false });

const EXAMPLES = [
  "a robot that fetches my keys from under the couch",
  "a little rover that patrols my apartment at night",
  "a warehouse bot for tight aisles",
  "something that can climb the ramp to my porch",
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const phone = process.env.NEXT_PUBLIC_PHOTON_NUMBER ?? "(number coming)";

  async function go() {
    if (busy || !prompt.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${BACKEND}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, source: "web" }) });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      router.push(`/run/${data.run_id}`);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-ink text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_35%,#172b4d_0%,#0b0d12_65%)]" />
      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-6 py-6 md:px-12">
        <span className="text-xl font-black tracking-tight">ROBO<span className="text-acc">FORGE</span></span>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Idea → physics → reality</span>
      </header>
      <div className="mx-auto grid max-w-[1600px] items-center px-6 pb-10 md:px-12 lg:min-h-[calc(100svh-90px)] lg:grid-cols-[1.15fr_1fr]">
        <section className="relative z-10 pt-8 lg:py-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-acc">Real parts. Real physics.</p>
          <h1 className="max-w-4xl text-[clamp(2.7rem,5.6vw,6.5rem)] font-black leading-[0.98] tracking-[-0.055em]">Text a robot idea.<br /><span className="text-slate-300">Get a tested robot back.</span></h1>
          <p className="mt-6 max-w-lg text-lg text-slate-400 md:text-xl">Designed from real parts. Tested in simulation. Delivered to your phone.</p>
          <div className="mt-7 border-l-2 border-acc pl-5">
            <p className="text-xs uppercase tracking-widest text-slate-400">Text your idea · iMessage</p>
            <a href={phone === "(number coming)" ? undefined : `sms:${phone}`} className="mt-1 block break-words text-3xl font-black tracking-tight sm:text-4xl xl:text-5xl">{phone}</a>
            <p className="mt-2 text-sm text-slate-400">Get a simulation GIF and your complete build pack.</p>
          </div>
          <div className="mt-8 rounded-2xl border border-line bg-panel/90 p-4 shadow-2xl md:p-5">
            <label htmlFor="robot-prompt" className="mb-3 block text-xs uppercase tracking-widest text-slate-400">Or forge it right here</label>
            <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="flex flex-col gap-3 sm:flex-row">
              <input id="robot-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-4 py-4 text-base outline-none focus:border-acc" placeholder="Describe your robot…" />
              <button type="submit" disabled={busy || !prompt.trim()} className="shrink-0 rounded-lg bg-acc px-6 py-4 text-lg font-bold transition hover:brightness-110 disabled:opacity-50">{busy ? "Starting…" : "Forge it ↗"}</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => <button key={e} onClick={() => setPrompt(e)} className="rounded-full border border-line px-3 py-2 text-left text-xs text-slate-300 transition hover:border-acc hover:text-white">{e}</button>)}
            </div>
            {err && <p role="alert" className="mt-3 break-words text-bad">{err}</p>}
          </div>
        </section>
        <section className="relative h-[360px] sm:h-[480px] lg:h-[min(80svh,850px)]" aria-label="Sample robot preview">
          <div className="absolute -inset-x-10 inset-y-0 lg:-inset-x-16"><Hero3D /></div>
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Mecanum arm / sample build</p>
            <p className="mt-2 text-sm text-slate-500">4-wheel drive · onboard vision · precision gripper</p>
          </div>
        </section>
      </div>
    </main>
  );
}
