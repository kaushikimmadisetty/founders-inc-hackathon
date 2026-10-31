"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BACKEND, RunState } from "@/lib/types";

/** Revision keeps the existing run as parent; the next run owns its own stage flow. */
export function TweakBox({ run }: { run: RunState }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (busy || !text.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${BACKEND}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text.trim(), source: "web", parent_run_id: run.run_id }) });
      if (!r.ok) throw new Error("Could not start revision. Please try again.");
      const d = await r.json(); router.push(`/run/${d.run_id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection failed. Please try again."); setBusy(false); }
  }
  return <div>
    {error && <p role="alert" className="mb-2 rounded-xl bg-white p-3 text-sm text-bad shadow-sm">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void go(); }} className="ask-pill">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></span>
      <input aria-label="Ask RoboForge to revise this robot" value={text} onChange={e => setText(e.target.value)} placeholder="Ask RoboForge · change something…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" />
      <button type="submit" aria-label="Revise and simulate" disabled={busy || !text.trim()} className="h-10 min-w-10 rounded-full bg-acc px-3 text-white disabled:opacity-50">{busy ? "…" : "↑"}</button>
    </form>
  </div>;
}
