import { RunState } from "@/lib/types";

function Dl({ href, label }: { href?: string | null; label: string }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-acc">{label}</a>
  ) : (
    <span className="rounded-lg border border-line px-3 py-2 text-sm text-slate-600">{label}</span>
  );
}

export function BuildPack({ run }: { run: RunState | null }) {
  const latest = run?.reports.at(-1);
  const bom = run?.parts?.parts ?? [];
  return (
    <aside className="panel flex flex-col gap-4 p-4">
      <h2 className="text-lg font-bold">Build pack</h2>
      <div className="flex flex-wrap gap-2">
        <Dl href={run?.body?.chassis_stl_url} label="Chassis STL" />
        <Dl href={run?.body?.chassis_step_url} label="STEP" />
        <Dl href={run?.board?.render_png_url} label="PCB render" />
        <Dl href={run?.board?.gerbers_zip_url} label="Gerbers" />
        <Dl href={latest?.mjcf_url} label="MJCF" />
        <Dl href={run?.brain?.controller_url} label="controller.py" />
        <Dl href={latest?.gif_url} label="Sim GIF" />
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-1">Part</th><th>Qty</th><th className="text-right">Price</th></tr></thead>
          <tbody>
            {bom.map((p) => (
              <tr key={p.role + p.name} className="border-t border-line">
                <td className="py-1.5"><a href={p.url} target="_blank" rel="noreferrer" className="hover:text-acc">{p.name}</a><span className="ml-1 text-xs text-slate-500">{p.role}</span></td>
                <td>{p.qty}</td>
                <td className="text-right">${(p.unit_price_usd * p.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-end justify-between border-t border-line pt-3">
        <span className="text-slate-400">Total BOM</span>
        <span className="text-3xl font-black">${run?.parts?.total_usd.toFixed(2) ?? "—"}</span>
      </div>
      {run?.board && <p className="text-xs text-slate-500">PCB provider: {run.board.provider}{run.board.provider === "fallback" && " (reference carrier board, HeyPCB export pending)"}</p>}
    </aside>
  );
}
