"use client";
import { useMemo, useState } from "react";
import type { RunState } from "@/lib/types";
import { firstPiece, GROUPS, identity, partFor } from "@/lib/partRefs";
import { buildPieces } from "./Robot3D";

export function PartsPanel({ run, selected, onSelect, spotlight }: { run: RunState | null; selected: string | null; onSelect: (id: string | null) => void; spotlight?: number }) {
  const [tab, setTab] = useState("Parts");
  const [query, setQuery] = useState("");
  const pieces = useMemo(() => buildPieces(run?.spec ?? null, run?.parts ?? null, run?.body ?? null, run?.board ?? null), [run?.spec, run?.parts, run?.body, run?.board]);
  const parts = run?.parts?.parts ?? [];
  const part = selected ? partFor(selected, parts) : undefined;
  const piece = pieces.find(p => p.id === selected);
  const rows = pieces.filter((p, i) => pieces.findIndex(q => identity(q.id).ref === identity(p.id).ref) === i);
  return <aside className="parts-panel panel flex min-h-0 flex-col overflow-hidden">
    <div className="border-b border-line p-3"><div className="segment grid grid-cols-2">{["Parts", "This robot"].map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</div></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {selected && piece && <section className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4" aria-live="polite">
        <div className="flex items-center justify-between"><span className="font-mono text-sm text-acc">{identity(selected).ref} · SELECTED</span><button aria-label="Clear selection" onClick={() => onSelect(null)} className="px-3">×</button></div>
        <h2 className="mt-1 text-lg font-semibold">{part?.name ?? piece.label ?? identity(selected).role}</h2>
        {part ? <><p className="my-2 text-sm text-slate-600">Qty {part.qty} · {part.mass_g} g each{part.stall_torque_nm != null && ` · ${part.stall_torque_nm} N·m`}{part.rated_rpm != null && ` · ${part.rated_rpm} rpm`}</p><p className="text-2xl font-semibold">${part.unit_price_usd.toFixed(2)} <span className="text-sm font-normal text-slate-600">each</span></p><p className="mt-2 text-sm text-ok">{part.source === "firecrawl" ? part.in_stock === false ? "Live price · out of stock" : "Live price verified" : "Catalog price"}</p><a href={part.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center text-sm font-medium text-acc">View at {part.vendor ?? "vendor"} ↗</a></> : <p className="mt-2 text-sm text-slate-600">{piece.size.map(v => Math.round(v * 1000)).join(" × ")} mm · generated geometry</p>}
      </section>}
      {tab === "Parts" ? <>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-2xl">Component library</h2><span className="text-sm text-slate-600">{parts.length} parts</span></div>
        {!parts.length && <p className="text-slate-600">Real components will appear as the parts agent sources your robot.</p>}
        <div className="grid grid-cols-2 gap-3">{parts.map((p, i) => {
          const active = (selected && identity(selected).role === p.role) || spotlight === i;
          return <button key={p.role + p.name} onClick={() => onSelect(firstPiece(p.role))} className={`part-card text-left ${active ? "selected" : ""}`}>
            <div className={`part-thumb part-${p.role}`} aria-hidden="true"><span className="iso-part"><i /><b /></span></div>
            <div className="p-3"><p className="mb-1 text-sm text-slate-600">{identity(firstPiece(p.role)).ref} · Qty {p.qty}</p><p className="text-sm font-medium leading-snug">{p.name}</p><p className="mt-2 text-sm font-semibold">${(p.unit_price_usd * p.qty).toFixed(2)}</p></div>
          </button>;
        })}</div>
      </> : <>
        <h2 className="font-serif text-2xl">Robot specification</h2>
        <p className="mt-2 text-sm text-slate-600">{run?.spec?.template.replace(/_/g, " ") ?? "Planning your robot"}</p>
        <dl className="my-4 grid grid-cols-2 gap-3 rounded-xl bg-ink p-3 text-sm"><div><dt className="text-slate-600">Chassis</dt><dd>{run?.body?.dims_mm.join(" × ") ?? "—"} mm</dd></div><div><dt className="text-slate-600">Parts mass</dt><dd>{run?.parts?.total_mass_g ?? "—"} g</dd></div><div><dt className="text-slate-600">BOM total</dt><dd>${run?.parts?.total_usd.toFixed(2) ?? "—"}</dd></div><div><dt className="text-slate-600">Sensors</dt><dd>{run?.spec?.sensors.join(", ") || "None"}</dd></div></dl>
        <input aria-label="Find a component" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a part: M1, camera, motor…" className="mb-3 w-full rounded-xl border border-line px-3 py-2 text-sm" />
        {Object.entries(GROUPS).map(([group, roles]) => {
          const entries = rows.filter(p => roles.includes(identity(p.id).role) && `${identity(p.id).ref} ${p.label} ${partFor(p.id, parts)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
          return entries.length > 0 && <details key={group} open className="border-b border-line py-2"><summary className="min-h-9 cursor-pointer text-sm font-semibold">{group}<span className="float-right text-slate-600">{entries.length}</span></summary>{entries.map(p => <button key={p.id} onClick={() => onSelect(p.id)} className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left text-sm ${selected && identity(selected).ref === identity(p.id).ref ? "bg-blue-50 text-acc" : "hover:bg-ink"}`}><span className="w-10 shrink-0 font-mono font-semibold">{identity(p.id).ref}</span><span>{partFor(p.id, parts)?.name ?? (p.label || identity(p.id).role)}</span></button>)}</details>;
        })}
        <h3 className="mb-2 mt-5 font-semibold">Simulation history</h3>{run?.reports.map(r => <div key={r.iteration} className="mb-2 rounded-xl border border-line p-3 text-sm"><p className={r.passed ? "font-semibold text-ok" : "font-semibold text-bad"}>Attempt {r.iteration} · {r.passed ? "Passed" : "Needs a closer look"}</p><p className="mt-1 text-slate-600">{r.passed ? `${r.metrics.time_s.toFixed(1)} s · target ${r.metrics.reached_target ? "reached" : "not reached"}` : r.failure_detail}</p></div>)}
      </>}
    </div>
    <div className="flex justify-between border-t border-line p-4 text-sm"><span className="text-slate-600">Selected BOM</span><strong>${run?.parts?.total_usd.toFixed(2) ?? "—"}</strong></div>
  </aside>;
}
