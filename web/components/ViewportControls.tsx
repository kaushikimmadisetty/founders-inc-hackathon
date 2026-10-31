"use client";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

export type ViewPreset = "3D" | "Top" | "Ortho" | "Front" | "Right";
export function useViewport() {
  const [view, setView] = useState({ preset: "3D" as ViewPreset, zoom: 1, revision: 0 });
  const snap = (preset: ViewPreset) => setView(v => ({ preset, zoom: 1, revision: v.revision + 1 }));
  const zoom = (factor: number) => setView(v => ({ ...v, zoom: THREE.MathUtils.clamp(v.zoom * factor, 0.2, 4), revision: v.revision + 1 }));
  return { view, snap, zoom };
}
export function ViewportTools({ controls, exploded, onExplode }: { controls: ReturnType<typeof useViewport>; exploded: boolean; onExplode: () => void }) {
  return <>
    <div className="viewport-presets segment flex" aria-label="Camera projection">{(["3D", "Top", "Ortho"] as const).map(p => <button key={p} aria-pressed={controls.view.preset === p} onClick={() => controls.snap(p)} className={controls.view.preset === p ? "active" : ""}>{p}</button>)}</div>
    <div className="view-tools">
      <div className="view-cube" aria-label="View cube"><button className="cube-top" onClick={() => controls.snap("Top")} aria-label="Top view">TOP</button><button className="cube-front" onClick={() => controls.snap("Front")} aria-label="Front view">FRONT</button><button className="cube-right" onClick={() => controls.snap("Right")} aria-label="Right view">RIGHT</button></div>
      <button className="tool-button" title="Home view" aria-label="Reset view" onClick={() => controls.snap("3D")}><ToolIcon kind="home" /></button>
      <button className="tool-button" title="Fit model" aria-label="Fit model to screen" onClick={() => controls.snap(controls.view.preset)}><ToolIcon kind="fit" /></button>
      <button className="tool-button" title="Zoom in" aria-label="Zoom in" onClick={() => controls.zoom(1.25)}><ToolIcon kind="plus" /></button>
      <button className="tool-button" title="Zoom out" aria-label="Zoom out" onClick={() => controls.zoom(0.8)}><ToolIcon kind="minus" /></button>
      <button className={`tool-button ${exploded ? "text-acc ring-2 ring-blue-200" : ""}`} title="Explode assembly" aria-label="Toggle exploded assembly" aria-pressed={exploded} onClick={onExplode}><ToolIcon kind="explode" /></button>
    </div>
  </>;
}
function ToolIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = { home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9", fit: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6", plus: "M12 5v14M5 12h14", minus: "M5 12h14", explode: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

/** Shared Z-up camera rig. Follow moves both eye and target, preserving orbit. */
export function CameraRig({ view, radius = 0.23, center = [0, 0, 0.04], follow, focusLeft = false }: { view: ReturnType<typeof useViewport>["view"]; radius?: number; focusLeft?: boolean; center?: [number, number, number]; follow?: MutableRefObject<THREE.Vector3> }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { size, camera } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (focusLeft && size.width > 550) cam.setViewOffset(size.width, size.height, size.width * 0.19, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, focusLeft, size.width, size.height]);
  const transition = useRef(1);
  const start = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const previousFollow = useRef(new THREE.Vector3());
  const requested = useRef(true);
  const initial = useMemo(() => new THREE.Vector3(0.4, -0.48, 0.36), []);
  const fitRadius = radius / Math.min(1, size.width / size.height);
  const distance = fitRadius / Math.sin(THREE.MathUtils.degToRad(19)) * 1.12 / view.zoom;
  const orthoZoom = size.height / (fitRadius * 2.5) * view.zoom;
  useEffect(() => { requested.current = true; }, [view, radius, size.width, size.height]);
  useFrame(({ camera }, dt) => {
    const c = controls.current;
    if (!c) return;
    const target = follow ? follow.current.clone() : new THREE.Vector3(...center);
    if (requested.current) {
      start.current.copy(camera.position); startTarget.current.copy(c.target);
      transition.current = 0; requested.current = false;
    }
    if (transition.current < 1) {
      transition.current = Math.min(1, transition.current + dt / 0.6);
      const t = 1 - Math.pow(1 - transition.current, 3);
      const dir = view.preset === "Top" ? new THREE.Vector3(0, -0.0001, 1) : view.preset === "Front" ? new THREE.Vector3(0, -1, 0.0001) : view.preset === "Right" ? new THREE.Vector3(1, 0, 0.0001) : new THREE.Vector3(0.9, -1.15, 0.85).normalize();
      camera.position.lerpVectors(start.current, target.clone().addScaledVector(dir, distance), t);
      c.target.lerpVectors(startTarget.current, target, t);
    } else if (follow) {
      const delta = target.clone().sub(previousFollow.current);
      c.target.add(delta); camera.position.add(delta);
    }
    previousFollow.current.copy(target);
    c.update();
  });
  return <>
    <PerspectiveCamera makeDefault={view.preset !== "Ortho"} position={initial} up={[0, 0, 1]} fov={38} near={0.001} far={100} />
    <OrthographicCamera makeDefault={view.preset === "Ortho"} position={initial} up={[0, 0, 1]} zoom={orthoZoom} near={0.001} far={100} />
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minDistance={0.08} maxDistance={20} minZoom={20} maxZoom={10000} onStart={() => { transition.current = 1; }} />
  </>;
}
export type PartHover = { label: string; x: number; y: number } | null;
export type PartInteraction = { selected?: string | null; onSelect?: (id: string | null) => void; onHover?: (hover: PartHover) => void };
export function PartTooltip({ hover }: { hover: PartHover }) {
  return hover ? <div role="tooltip" className="pointer-events-none fixed z-50 max-w-72 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg" style={{ left: Math.max(8, Math.min(hover.x + 14, window.innerWidth - 290)), top: Math.max(8, hover.y - 42) }}>{hover.label}</div> : null;
}
