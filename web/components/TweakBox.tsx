"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BACKEND, RunState } from "@/lib/types";

const IDEAS = ["make it cheaper", "add a camera", "make it smaller", "stronger motors", "add a gripper arm", "longer battery life"];

/** Web twin of texting a change back: revises this robot and re-runs the sim gate. */
export function TweakBox({ run }: { run: RunState }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    const r = await fetch(`${BACKEND}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: t.trim(), source: "web", parent_run_id: run.run_id }) });
    if (r.ok) { const d = await r.json(); router.push(`/run/${d.run_id}`); } else setBusy(false);
  }
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-widest text-slate-400">Change something (or text it back)</p>
      <div className="mt-2 flex flex-col gap-2 md:flex-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="e.g. make it cheaper and add a camera"
          className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 outline-none focus:border-acc" />
        <button onClick={() => go()} disabled={busy || !text.trim()} className="rounded-lg bg-acc px-5 py-2 font-bold disabled:opacity-50">{busy ? "Revising…" : "Revise & re-test"}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {IDEAS.map((i) => <button key={i} onClick={() => go(i)} className="rounded-full border border-line px-3 py-1 text-xs text-slate-300 hover:border-acc">{i}</button>)}
      </div>
    </div>
  );
}
