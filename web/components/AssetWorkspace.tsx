"use client";
import { Component, Suspense, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { assetMatchesId, mediaUrl, useGallery } from "@/lib/gallery";
import { CameraRig, useViewport, ViewportTools, WorkspaceToolbar } from "./ViewportControls";
import { BlueprintFloor, StudioLights } from "./BlueprintFloor";
import { HelpButton } from "./Gallery";
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Html center><p className="rounded-xl bg-white p-4 text-sm">3D asset unavailable. Visit the source to download it.</p></Html> : this.props.children; }
}
function AssetModel({ url }: { url: string }) {
  const { scene } = useGLTF(mediaUrl(url));
  const model = useMemo(() => { const clone = scene.clone(true); clone.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); return clone; }, [scene]);
  return <primitive object={model} rotation={[Math.PI / 2, 0, 0]} />;
}
export default function AssetWorkspace({ id }: { id: string }) {
  const { data, error } = useGallery(); const controls = useViewport(); const [panel, setPanel] = useState(true);
  const asset = data?.assets.find(a => assetMatchesId(a, id));
  const dims = asset?.dims_m ?? [1, 1, 1];
  const message = error ? "Cannot reach the gallery backend. Retrying…" : !data ? "Loading asset details…" : data.warming ? "The gallery is warming up. Retrying until this asset is ready…" : "Asset not found in the gallery. Return to the dashboard to choose another.";
  return <main className="flex h-svh flex-col overflow-hidden"><header className="cad-header"><Link href="/" className="brand-link"><span className="logo-mark">R</span><strong className="font-serif">roboforge</strong></Link><Link className="header-crumb" href="/dashboard">/ dashboard /</Link><h1 className="min-w-0 truncate font-serif text-xl">{asset?.title ?? "Asset"}</h1><div className="header-actions"><Link className="explore-pill" href="/build">Build a robot</Link></div></header><div className={`cad-workspace ${panel ? "" : "panel-hidden"}`}>
    <WorkspaceToolbar controls={controls} onClear={() => controls.snap("3D")} onBuildPack={() => setPanel(true)} panelVisible={panel} onTogglePanel={() => setPanel(v => !v)} asset />
    <div className="cad-viewport"><ViewportTools controls={controls} exploded={false} onExplode={() => {}} hideExplode />
      {asset?.glb_url ? <Canvas shadows camera={{ up: [0, 0, 1], position: [2, -3, 2] }}><StudioLights /><BlueprintFloor size={Math.max(2, ...dims) * 3} /><ModelBoundary key={asset.glb_url}><Suspense fallback={<><mesh position={[0, 0, dims[2] / 2]}><boxGeometry args={dims} /><meshStandardMaterial color="#8ca6bd" wireframe /></mesh><Html center><p role="status" className="rounded-xl bg-white p-3 text-sm">Loading 3D asset…</p></Html></>}><AssetModel url={asset.glb_url} /></Suspense></ModelBoundary><CameraRig view={controls.view} radius={Math.max(.1, Math.hypot(...dims) / 2)} center={[0, 0, dims[2] / 2]} /></Canvas> : <p role="status" className="viewport-message">{asset ? "3D model unavailable. Asset details and source are available in the panel." : message}</p>}
      <p className="cad-attribution">{asset?.maker} · {asset?.license}</p><div className="cad-readout">Drag to orbit · Scroll to zoom</div>
    </div>{panel && <aside className="parts-panel p-6"><div className="segment mb-6 text-center">This asset</div><h2 className="font-serif text-3xl">{asset?.title ?? "Asset details"}</h2>{!asset && <p role="status" className="my-6 text-sm text-slate-600">{message} <Link href="/dashboard" className="text-acc underline">Browse assets</Link></p>}{asset && <><dl className="my-6 space-y-4 text-sm"><div><dt className="text-slate-500">Maker</dt><dd>{asset.maker}</dd></div><div><dt className="text-slate-500">Category</dt><dd>{asset.category}</dd></div><div><dt className="text-slate-500">License</dt><dd>{asset.license ?? "License not supplied"}</dd></div><div><dt className="text-slate-500">Dimensions</dt><dd>{asset.dims_m?.map(v => +(v * 100).toFixed(1)).join(" × ") ?? "Unavailable"} cm</dd></div></dl>{asset.source_url && <a href={asset.source_url} target="_blank" rel="noreferrer" className="text-sm text-acc underline">View source on Hugging Face ↗</a>}<section className="mt-8 rounded-xl border border-line bg-white p-4"><h3 className="font-semibold">Use in a scene</h3><p className="mt-2 text-sm text-slate-600">Mention this {asset.title.toLowerCase()} in your robot idea to describe its environment. Assets provide scene context; they are not robot BOM parts.</p><Link href={`/build?prompt=${encodeURIComponent(`a robot that works around a ${asset.title.toLowerCase()}`)}`} className="mt-4 inline-block text-sm text-acc">Build with this idea ↗</Link></section></>}</aside>}<div className="step-tape text-sm text-slate-500">Static asset inspection · dimensions in centimetres</div></div><HelpButton /></main>;
}
