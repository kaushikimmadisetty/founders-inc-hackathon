"use client";
import Link from "next/link";
import { useState } from "react";
import type { RunState } from "@/lib/types";

export function CADHeader({ run, onBuildPack }: { run: RunState | null; onBuildPack: () => void }) {
  const [message, setMessage] = useState("");
  const url = () => run ? `${window.location.origin}/run/${run.run_id}` : window.location.href;
  async function copy() {
    try { await navigator.clipboard.writeText(url()); setMessage("Link copied"); }
    catch { setMessage("Copy the address from your browser"); }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "RoboForge", text: run?.prompt, url: url() });
      else await copy();
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("Sharing unavailable — use Copy link"); }
  }
  return <header className="cad-header">
    <Link href="/" className="brand-link"><span className="logo-mark">R</span><strong>roboforge</strong></Link>
    <Link href="/dashboard" className="header-crumb">/ dashboard /</Link>
    <h1 className="min-w-0 truncate font-serif text-xl" title={run?.parent_run_id ? `Revision: ${run.modification || run.prompt}` : run?.prompt}>{run?.parent_run_id ? `Revision: ${run.modification || run.prompt}` : run?.prompt ?? "Untitled robot"}</h1>
    <span className="header-status">{run ? `${run.status} · attempt ${Math.max(1, run.iteration)}` : "Connecting"}</span>
    <div className="header-actions"><button onClick={() => void copy()}>Copy link</button><button onClick={onBuildPack}>Build pack</button><button onClick={() => void share()} className="share-button">Share</button></div>
    {message && <button className="header-notice" onClick={() => setMessage("")} aria-label={`${message}. Dismiss`} role="status">{message} ×</button>}
  </header>;
}
