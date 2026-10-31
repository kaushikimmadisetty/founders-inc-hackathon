"use client";

import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { BACKEND } from "@/lib/types";

type Vector3 = [number, number, number];
export interface PropAsset {
  glb_url: string;
  obj_url: string;
  thumbnail_url: string;
  /** Bounding box in metres, in MuJoCo X/Y/Z coordinates. GLB itself is Y-up. */
  dims_m: Vector3;
  source_url: string;
  license: string;
}
const cache = new Map<string, Promise<PropAsset | null>>();

export function usePropAsset(query: string): PropAsset | null {
  const [result, setResult] = useState<{ query: string; asset: PropAsset | null } | null>(null);
  const key = query.trim().toLowerCase();
  useEffect(() => {
    let active = true;
    if (!key) return;
    if (!cache.has(key)) {
      cache.set(key, fetch(`${BACKEND}/assets/prop?query=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(22000) })
        .then(async (response) => response.ok ? await response.json() as PropAsset | null : null)
        .catch(() => null));
    }
    void cache.get(key)!.then((asset) => { if (active) setResult({ query: key, asset }); });
    return () => { active = false; };
  }, [key]);
  return result?.query === key ? result.asset : null;
}

function Box() {
  return <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#64748b" roughness={0.85} />
  </mesh>;
}
class AssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Box /> : this.props.children; }
}
function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const copy = useMemo(() => {
    const object = scene.clone(true);
    object.traverse((child) => { child.castShadow = true; child.receiveShadow = true; });
    return object;
  }, [scene]);
  return <primitive object={copy} />;
}

/** Y-up GLB, grounded at its origin. For a Z-up scene use rotation={[Math.PI / 2, 0, 0]}. */
export function PropGLB({ url, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: {
  url: string; position?: Vector3; rotation?: Vector3; scale?: number | Vector3;
}) {
  return <group position={position} rotation={rotation} scale={scale}>
    <AssetBoundary key={url}><Suspense fallback={<Box />}><Model url={url} /></Suspense></AssetBoundary>
  </group>;
}
