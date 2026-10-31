"use client";
import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

export type ViewPreset = "3D" | "Top" | "Ortho" | "Board" | "Front" | "Right";
export function useViewport() {
  const [view, setView] = useState({ preset: "3D" as ViewPreset, zoom: 1, revision: 0 });
  const snap = (preset: ViewPreset) => setView(v => ({ preset, zoom: 1, revision: v.revision + 1 }));
  const zoom = (factor: number) => setView(v => ({ ...v, zoom: THREE.MathUtils.clamp(v.zoom * factor, 0.2, 4), revision: v.revision + 1 }));
  return { view, snap, zoom };
}
export function ViewportTools({ controls, exploded, onExplode, hideExplode = false }: { controls: ReturnType<typeof useViewport>; exploded: boolean; onExplode: () => void; hideExplode?: boolean }) {
  return <>
    <div className="view-tools">
      <div className="view-cube" aria-label="View cube"><button className="cube-top" onClick={() => controls.snap("Top")} aria-label="Top view">TOP</button><button className="cube-front" onClick={() => controls.snap("Front")} aria-label="Front view">FRONT</button><button className="cube-right" onClick={() => controls.snap("Right")} aria-label="Right view">RIGHT</button></div>
      <button className="tool-button" title="Home view" aria-label="Reset view" onClick={() => controls.snap("3D")}><ToolIcon kind="home" /></button>
      <button className="tool-button" title="Fit model" aria-label="Fit model to screen" onClick={() => controls.snap(controls.view.preset)}><ToolIcon kind="fit" /></button>
      <button className="tool-button" title="Zoom in" aria-label="Zoom in" onClick={() => controls.zoom(1.25)}><ToolIcon kind="plus" /></button>
      <button className="tool-button" title="Zoom out" aria-label="Zoom out" onClick={() => controls.zoom(0.8)}><ToolIcon kind="minus" /></button>
      {!hideExplode && <button className={`tool-button ${exploded ? "text-acc ring-2 ring-blue-200" : ""}`} title="Explode assembly" aria-label="Toggle exploded assembly" aria-pressed={exploded} onClick={onExplode}><ToolIcon kind="explode" /></button>}
    </div>
  </>;
}
export function WorkspaceToolbar({ controls, onClear, onBuildPack, panelVisible, onTogglePanel, asset = false }: { controls: ReturnType<typeof useViewport>; onClear: () => void; onBuildPack: () => void; panelVisible: boolean; onTogglePanel: () => void; asset?: boolean }) {
  return <div className="workspace-toolbar">
    <div className="toolbar-left"><button title="Clear selection" aria-label="Clear selection" onClick={onClear}>⌖</button><button title="Reset view" aria-label="Reset view" onClick={() => controls.snap("3D")}><ToolIcon kind="home" /></button><button title="Fit model" aria-label="Fit model" onClick={() => controls.snap(controls.view.preset)}><ToolIcon kind="fit" /></button><span className="toolbar-divider" /><button title={asset ? "Asset details" : "Build pack"} aria-label={asset ? "Open asset details" : "Open build pack"} onClick={onBuildPack}>⇩</button></div>
    <div className="viewport-presets segment flex" aria-label="Camera projection">{(asset ? ["3D", "Top", "Ortho"] as const : ["3D", "Top", "Ortho", "Board"] as const).map(p => <button key={p} aria-pressed={controls.view.preset === p} onClick={() => controls.snap(p)} className={controls.view.preset === p ? "active" : ""}>{p}</button>)}</div>
    <div className="toolbar-right"><button title={asset ? "Asset details" : "This robot's build pack"} aria-label={asset ? "Open asset details" : "Open build pack"} onClick={onBuildPack}>◫</button><button title={asset ? "Toggle asset details" : "Toggle parts panel"} aria-label={asset ? "Toggle asset details" : "Toggle parts panel"} aria-pressed={panelVisible} onClick={onTogglePanel}>▥</button></div>
  </div>;
}
function ToolIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = { home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9", fit: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6", plus: "M12 5v14M5 12h14", minus: "M5 12h14", explode: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

/** Z-up, fixed target. Only an explicit preset/zoom request animates the camera. */
export function CameraRig({ view, radius = 0.23, center = [0, 0, 0.04] }: { view: ReturnType<typeof useViewport>["view"]; radius?: number; center?: [number, number, number] }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { size } = useThree();
  const initial = useMemo(() => new THREE.Vector3(0.4, -0.48, 0.36), []);
  const transition = useRef(1);
  const initialized = useRef(false);
  const previousRevision = useRef(view.revision);
  const start = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const destination = useRef(new THREE.Vector3());
  const destinationTarget = useRef(new THREE.Vector3());
  const fitRadius = radius / Math.min(1, size.width / size.height);
  const distance = fitRadius / Math.sin(THREE.MathUtils.degToRad(19)) * 1.12 / view.zoom;
  const orthoZoom = size.height / (fitRadius * 2.5) * view.zoom;
  useFrame(({ camera }, dt) => {
    const c = controls.current;
    if (!c) return;
    const clicked = previousRevision.current !== view.revision;
    if (!initialized.current || clicked) {
      const target = new THREE.Vector3(...center);
      const dir = (view.preset === "Top" || view.preset === "Board") ? new THREE.Vector3(0, -0.0001, 1) : view.preset === "Front" ? new THREE.Vector3(0, -1, 0.0001) : view.preset === "Right" ? new THREE.Vector3(1, 0, 0.0001) : new THREE.Vector3(0.9, -1.15, 0.85).normalize();
      destination.current.copy(target).addScaledVector(dir, distance);
      destinationTarget.current.copy(target);
      start.current.copy(camera.position); startTarget.current.copy(c.target);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      transition.current = initialized.current && !reducedMotion ? 0 : 1;
      if (transition.current === 1) { camera.position.copy(destination.current); c.target.copy(target); c.update(); }
      initialized.current = true; previousRevision.current = view.revision;
    }
    if (transition.current >= 1) return;
    transition.current = Math.min(1, transition.current + dt / 0.35);
    const t = 1 - Math.pow(1 - transition.current, 3);
    camera.position.lerpVectors(start.current, destination.current, t);
    c.target.lerpVectors(startTarget.current, destinationTarget.current, t);
    c.update();
  });
  return <>
    <PerspectiveCamera makeDefault={view.preset !== "Ortho"} position={initial} up={[0, 0, 1]} fov={38} near={0.001} far={100} />
    <OrthographicCamera makeDefault={view.preset === "Ortho"} position={initial} up={[0, 0, 1]} zoom={orthoZoom} near={0.001} far={100} />
    <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={0.08} maxDistance={20} minZoom={20} maxZoom={10000} onStart={() => { transition.current = 1; }} />
  </>;
}
export type PartHover = { label: string; x: number; y: number } | null;
export type PartInteraction = { selected?: string | null; onSelect?: (id: string | null) => void; onHover?: (hover: PartHover) => void };
export function PartTooltip({ hover }: { hover: PartHover }) {
  return hover ? <div role="tooltip" className="pointer-events-none fixed z-50 max-w-72 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg" style={{ left: Math.max(8, Math.min(hover.x + 14, window.innerWidth - 290)), top: Math.max(8, hover.y - 42) }}>{hover.label}</div> : null;
}
