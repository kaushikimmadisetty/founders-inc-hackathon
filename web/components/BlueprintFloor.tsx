"use client";
import { useEffect, useMemo, Suspense, Component, type ReactNode } from "react";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";

/** Metres in world space, millimetres on the drawing. No Html portals. */
export function BlueprintFloor({ size = 1, zUp = true, height = 0 }: { size?: number; zUp?: boolean; height?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#eaf2fb"; ctx.fillRect(0, 0, 2048, 2048);
    const mm = size * 1000, scale = 2048 / mm;
    for (let n = 0; n <= mm; n += 10) {
      const p = n * scale;
      ctx.strokeStyle = n % 50 === 0 ? "#8fb3e8" : "#c7dbf5";
      ctx.lineWidth = n % 50 === 0 ? 1.8 : 0.7;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 2048); ctx.moveTo(0, p); ctx.lineTo(2048, p); ctx.stroke();
    }
    ctx.fillStyle = "#526d90"; ctx.font = `${Math.max(12, scale * 3)}px sans-serif`;
    const step = size <= 1 ? 10 : 100;
    for (let n = 0; n < mm; n += step) {
      ctx.fillText(String(n), n * scale + 3, 18);
      ctx.fillText(String(n), 4, n * scale + 32);
    }
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, [size]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group rotation={zUp ? [Math.PI / 2, 0, 0] : [0, 0, 0]} position={zUp ? [0, 0, height] : [0, height, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
      <planeGeometry args={[size, size]} /><meshStandardMaterial map={texture} roughness={0.95} />
    </mesh>
    <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={size} blur={2.5} far={0.65} resolution={256} color="#526581" />
  </group>;
}
class ReflectionFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export function StudioLights({ zUp = true }: { zUp?: boolean }) {
  return <>
    <color attach="background" args={["#f7f8fa"]} />
    <hemisphereLight args={["#ffffff", "#b7c6da", 1.5]} />
    <directionalLight position={zUp ? [1, -2, 4] : [1, 4, 2]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0001} />
    <ReflectionFallback><Suspense fallback={null}><Environment preset="city" environmentIntensity={0.45} /></Suspense></ReflectionFallback>
  </>;
}
