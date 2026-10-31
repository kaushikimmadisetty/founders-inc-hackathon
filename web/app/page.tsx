"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BACKEND } from "@/lib/types";

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
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${BACKEND}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, source: "web" }) });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      router.push(`/run/${data.run_id}`);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="text-center">
        <p className="pill bg-acc/20 text-acc">RoboForge</p>
        <h1 className="mt-6 text-5xl font-black leading-tight md:text-7xl">Text a robot idea.<br />Get a tested robot back.</h1>
        <p className="mt-6 max-w-2xl text-xl text-slate-400">Real parts, real physics. Every design passes a MuJoCo sim gate before you see it. Failures route back to the agent that caused them.</p>
      </div>

      <div className="panel w-full p-8 text-center">
        <p className="text-sm uppercase tracking-widest text-slate-400">Text your idea to</p>
        <p className="mt-2 text-5xl font-black tracking-tight md:text-6xl">{phone}</p>
        <p className="mt-2 text-slate-400">iMessage via Photon. You get a GIF and a link back.</p>
      </div>

      <div className="panel w-full p-6">
        <p className="mb-3 text-sm uppercase tracking-widest text-slate-400">or start from the web</p>
        <div className="flex flex-col gap-3 md:flex-row">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
            className="flex-1 rounded-lg border border-line bg-ink px-4 py-4 text-lg outline-none focus:border-acc" placeholder="describe the robot" />
          <button onClick={go} disabled={busy || !prompt.trim()} className="rounded-lg bg-acc px-8 py-4 text-lg font-bold disabled:opacity-50">{busy ? "Starting…" : "Forge it"}</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} onClick={() => setPrompt(e)} className="rounded-full border border-line px-3 py-1 text-sm text-slate-300 hover:border-acc">{e}</button>)}
        </div>
        {err && <p className="mt-3 text-bad">{err}</p>}
      </div>
    </main>
  );
}
