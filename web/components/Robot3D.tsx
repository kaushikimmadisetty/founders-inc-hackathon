"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Grid, ContactShadows } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BoardArtifact, BodyArtifact, PartsSelection, RobotSpec } from "@/lib/types";

/** Full robot built from the real spec/parts/body/board, as the same primitives
 *  MuJoCo uses. `progress` 0..1 explodes/assembles it; each part has a stagger
 *  window so they fly in one at a time. Units: metres, z up (MuJoCo frame). */

type Piece = {
  id: string; label: string; price?: number;
  pos: [number, number, number]; size: [number, number, number];
  shape: "box" | "cyl" | "sphere"; rot?: [number, number, number];
  color: string; from: [number, number, number]; order: number; emissive?: string;
};

export function buildPieces(spec: RobotSpec | null, parts: PartsSelection | null, body: BodyArtifact | null, board: BoardArtifact | null): Piece[] {
  const [Lmm, Wmm, Hmm] = body?.dims_mm ?? [spec?.params.chassis_length_mm ?? 200, spec?.params.chassis_width_mm ?? 160, spec?.params.chassis_height_mm ?? 60];
  const L = Lmm / 1000, W = Wmm / 1000, H = Hmm / 1000;
  const wr = (body?.wheel_diameter_mm ?? spec?.params.wheel_diameter_mm ?? 60) / 2000;
  const template = spec?.template ?? "diff_drive_rover";
  const mecanum = template !== "diff_drive_rover";
  const byRole = (r: string) => parts?.parts.find((p) => p.role === r);
  const mm = (p: { dims_mm: [number, number, number] } | undefined, fallback: [number, number, number]): [number, number, number] =>
    p ? [p.dims_mm[0] / 1000, p.dims_mm[1] / 1000, p.dims_mm[2] / 1000] : fallback;
  const pieces: Piece[] = [];
  let order = 0;

  // chassis tray: floor + 4 walls so you can see inside
  const wall = 0.003;
  const tray = "#3b82f6";
  pieces.push({ id: "floor", label: "Chassis (3D printed)", pos: [0, 0, wall / 2], size: [L, W, wall], shape: "box", color: tray, from: [0, 0, 0.5], order: order++ });
  pieces.push({ id: "wall-x0", label: "", pos: [-L / 2 + wall / 2, 0, H / 2], size: [wall, W, H], shape: "box", color: tray, from: [-0.4, 0, 0.3], order });
  pieces.push({ id: "wall-x1", label: "", pos: [L / 2 - wall / 2, 0, H / 2], size: [wall, W, H], shape: "box", color: tray, from: [0.4, 0, 0.3], order });
  pieces.push({ id: "wall-y0", label: "", pos: [0, -W / 2 + wall / 2, H / 2], size: [L, wall, H], shape: "box", color: tray, from: [0, -0.4, 0.3], order });
  pieces.push({ id: "wall-y1", label: "", pos: [0, W / 2 - wall / 2, H / 2], size: [L, wall, H], shape: "box", color: tray, from: [0, 0.4, 0.3], order: order++ });

  // motors + wheels
  const motor = byRole("drive_motor");
  const md = mm(motor, [0.012, 0.01, 0.034]);
  const wheelPos: [number, number][] = mecanum
    ? [[L * 0.35, W / 2 + 0.017], [L * 0.35, -(W / 2 + 0.017)], [-L * 0.35, W / 2 + 0.017], [-L * 0.35, -(W / 2 + 0.017)]]
    : [[L * 0.25, W / 2 + 0.012], [L * 0.25, -(W / 2 + 0.012)]];
  wheelPos.forEach(([x, y], i) => {
    const side = Math.sign(y);
    pieces.push({ id: `motor${i}`, label: i === 0 ? `${motor?.qty ?? wheelPos.length}× ${motor?.name ?? "gear motor"}` : "", price: i === 0 ? (motor ? motor.unit_price_usd * motor.qty : undefined) : undefined,
      pos: [x, side * (W / 2 - md[2] / 2 - wall), wr * 0.6 + 0.004], size: [md[0], md[2], md[1]], shape: "cyl", rot: [Math.PI / 2, 0, 0], color: "#c0c4cc", from: [x, side * 0.5, 0.25], order: order + i });
  });
  order += wheelPos.length;
  const wheel = byRole("wheel");
  wheelPos.forEach(([x, y], i) => {
    pieces.push({ id: `wheel${i}`, label: i === 0 ? `${wheel?.qty ?? wheelPos.length}× ${wheel?.name ?? "wheel"}` : "", price: i === 0 && wheel ? wheel.unit_price_usd * wheel.qty : undefined,
      pos: [x, y, 0], size: [wr, mecanum ? 0.03 : 0.02, 0], shape: "cyl", rot: [Math.PI / 2, 0, 0], color: "#15171c", from: [x, Math.sign(y) * 0.7, 0.05], order: order + i });
  });
  order += wheelPos.length;
  if (!mecanum) {
    const caster = byRole("caster");
    pieces.push({ id: "caster", label: caster?.name ?? "ball caster", price: caster?.unit_price_usd, pos: [-L * 0.4, 0, -(wr - 0.012)], size: [0.012, 0, 0], shape: "sphere", color: "#666", from: [-0.5, 0, -0.1], order: order++ });
  }

  // battery (clamped inside), centred low
  const bat = byRole("battery");
  const bd = mm(bat, [0.07, 0.035, 0.015]).map((v, i) => Math.min(v, [L * 0.6, W * 0.8, H * 0.8][i])) as [number, number, number];
  pieces.push({ id: "battery", label: bat?.name ?? "battery", price: bat?.unit_price_usd, pos: [-0.02, 0, wall + bd[2] / 2], size: bd, shape: "box", color: "#f59e0b", from: [-0.02, 0, 0.6], order: order++ });

  // PCB plate + MCU + drivers + regulator
  const pcb = board?.outline_mm ?? [80, 60];
  const pl = Math.min(pcb[0] / 1000, L - 2 * wall - 0.01), pw = Math.min(pcb[1] / 1000, W - 2 * wall - 0.01);
  const pcbZ = wall + bd[2] + 0.006;
  pieces.push({ id: "pcb", label: `Carrier PCB ${pcb[0]}×${pcb[1]} mm (${board?.provider ?? "pending"})`, pos: [L / 2 - pl / 2 - 0.012, 0, pcbZ], size: [pl, pw, 0.0016], shape: "box", color: "#0f6b3e", from: [0.1, 0, 0.7], order: order++ });
  const mcu = byRole("mcu"); const mcd = mm(mcu, [0.055, 0.028, 0.008]);
  pieces.push({ id: "mcu", label: mcu?.name ?? "MCU", price: mcu?.unit_price_usd, pos: [L / 2 - pl / 2 - 0.012 - pl * 0.15, 0, pcbZ + mcd[2] / 2 + 0.001], size: [Math.min(mcd[0], pl * 0.6), Math.min(mcd[1], pw * 0.5), mcd[2]], shape: "box", color: "#1f2937", from: [0.3, 0, 0.8], order: order++ });
  const drv = byRole("motor_driver");
  for (let i = 0; i < Math.max(1, Math.floor(wheelPos.length / 2)); i++) {
    pieces.push({ id: `drv${i}`, label: i === 0 ? `${drv?.qty ?? 1}× ${drv?.name ?? "motor driver"}` : "", price: i === 0 && drv ? drv.unit_price_usd * drv.qty : undefined,
      pos: [L / 2 - pl / 2 - 0.012 + pl * 0.3, (i === 0 ? 1 : -1) * pw * 0.28, pcbZ + 0.003], size: [0.02, 0.015, 0.004], shape: "box", color: "#374151", from: [0.3, (i === 0 ? 1 : -1) * 0.3, 0.8], order: order + i });
  }
  order += 2;
  const reg = byRole("regulator");
  pieces.push({ id: "reg", label: reg?.name ?? "regulator", price: reg?.unit_price_usd, pos: [L / 2 - pl / 2 - 0.012 + pl * 0.3, 0, pcbZ + 0.003], size: [0.017, 0.018, 0.004], shape: "box", color: "#4b5563", from: [0.3, 0, 0.9], order: order++ });
  const imu = byRole("imu");
  pieces.push({ id: "imu", label: imu?.name ?? "IMU", price: imu?.unit_price_usd, pos: [L / 2 - pl / 2 - 0.012 - pl * 0.4, pw * 0.3, pcbZ + 0.002], size: [0.02, 0.016, 0.003], shape: "box", color: "#6b7280", from: [0, 0.3, 0.9], order: order++ });

  // sensors on the front wall
  const cam = byRole("camera");
  if (cam && spec?.sensors.includes("camera")) {
    const cd = mm(cam, [0.027, 0.04, 0.012]);
    pieces.push({ id: "camera", label: cam.name, price: cam.unit_price_usd, pos: [L / 2 - 0.015, 0, H + cd[2] / 2], size: [0.024, 0.024, cd[2]], shape: "box", color: "#111", from: [0.5, 0, 0.4], order: order++, emissive: "#60a5fa" });
  }
  const tof = byRole("tof");
  if (tof && spec?.sensors.some((s) => s.startsWith("tof"))) {
    pieces.push({ id: "tof", label: tof.name, price: tof.unit_price_usd, pos: [L / 2 + 0.002, 0, H * 0.5], size: [0.004, 0.018, 0.013], shape: "box", color: "#1e293b", from: [0.6, 0, 0.1], order: order++, emissive: "#f87171" });
  }

  // arm
  if (template === "mecanum_arm") {
    const servo = byRole("servo"); const grip = byRole("gripper");
    const reach = (spec?.params.arm_reach_mm ?? 150) / 1000;
    const ax = L * 0.3, az = H;
    pieces.push({ id: "servo1", label: `${servo?.qty ?? 3}× ${servo?.name ?? "servo"}`, price: servo ? servo.unit_price_usd * servo.qty : undefined, pos: [ax, 0, az + 0.01], size: [0.015, 0.02, 0], shape: "cyl", color: "#d1d5db", from: [ax, 0, 0.9], order: order++ });
    pieces.push({ id: "link1", label: "arm link 1", pos: [ax + reach * 0.25, 0, az + 0.02], size: [reach * 0.5, 0.016, 0.016], shape: "box", color: "#e5e7eb", from: [ax + 0.3, 0, 0.9], order: order++ });
    pieces.push({ id: "servo2", label: "", pos: [ax + reach * 0.5, 0, az + 0.02], size: [0.012, 0.02, 0], shape: "cyl", rot: [Math.PI / 2, 0, 0], color: "#d1d5db", from: [ax + 0.4, 0, 1.0], order });
    pieces.push({ id: "link2", label: "arm link 2", pos: [ax + reach * 0.75, 0, az + 0.02], size: [reach * 0.5, 0.014, 0.014], shape: "box", color: "#e5e7eb", from: [ax + 0.5, 0, 1.0], order: order++ });
    pieces.push({ id: "gripL", label: grip?.name ?? "gripper", price: grip?.unit_price_usd, pos: [ax + reach + 0.02, 0.018, az + 0.02], size: [0.04, 0.006, 0.02], shape: "box", color: "#facc15", from: [ax + 0.7, 0.2, 1.0], order: order++ });
    pieces.push({ id: "gripR", label: "", pos: [ax + reach + 0.02, -0.018, az + 0.02], size: [0.04, 0.006, 0.02], shape: "box", color: "#facc15", from: [ax + 0.7, -0.2, 1.0], order });
  }
  return pieces;
}

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

export function pieceStart(p: Piece, total: number) { return (p.order / Math.max(total, 1)) * 0.8; }

function PieceMesh({ p, progress, total, showLabel }: { p: Piece; progress: number; total: number; showLabel: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  // stagger: piece k assembles over [start, start + 0.3]
  const start = pieceStart(p, total);
  const t = ease((progress - start) / 0.3);
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!ref.current) return;
    pos.set(p.pos[0] + p.from[0] * (1 - t), p.pos[1] + p.from[1] * (1 - t), p.pos[2] + p.from[2] * (1 - t));
    ref.current.position.copy(pos);
    const m = ref.current.material as THREE.MeshStandardMaterial;
    m.opacity = 0.25 + 0.75 * t;
  });
  const geom = p.shape === "box" ? <boxGeometry args={p.size} /> : p.shape === "cyl" ? <cylinderGeometry args={[p.size[0], p.size[0], p.size[1], 28]} /> : <sphereGeometry args={[p.size[0], 16, 16]} />;
  const rot = p.rot ?? (p.shape === "cyl" ? [0, 0, 0] : [0, 0, 0]);
  return (
    <mesh ref={ref} rotation={rot as [number, number, number]} castShadow receiveShadow>
      {geom}
      <meshStandardMaterial color={p.color} transparent opacity={1} roughness={0.55} metalness={p.color.startsWith("#c") || p.color.startsWith("#d") ? 0.6 : 0.1} emissive={p.emissive ?? "#000"} emissiveIntensity={p.emissive ? 0.8 : 0} />
    </mesh>
  );
}

/** Static or animated robot; drop inside a Canvas. progress 1 = fully assembled. */
export function RobotModel({ pieces, progress = 1, labels = false }: { pieces: Piece[]; progress?: number; labels?: boolean }) {
  const total = Math.max(...pieces.map((p) => p.order), 1) + 1;
  // label only the labelled piece currently flying in (latest started, not yet settled)
  let active: string | null = null;
  if (labels && progress < 1) {
    let best = -1;
    for (const p of pieces) {
      const st = pieceStart(p, total);
      if (p.label && st <= progress && st > best) { best = st; active = p.id; }
    }
  }
  const activePiece = pieces.find((p) => p.id === active) ?? null;
  return (
    <group>
      {pieces.map((p) => <PieceMesh key={p.id} p={p} progress={progress} total={total} showLabel={false} />)}
      {labels && <ActiveLabel piece={activePiece} progress={progress} total={total} />}
    </group>
  );
}

/** One always-mounted label that follows whichever part is flying in. Avoids
 *  mounting/unmounting drei Html per frame, which races React's commit. */
function ActiveLabel({ piece, progress, total }: { piece: Piece | null; progress: number; total: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current || !piece) return;
    const t = ease((progress - pieceStart(piece, total)) / 0.3);
    ref.current.position.set(piece.pos[0] + piece.from[0] * (1 - t), piece.pos[1] + piece.from[1] * (1 - t), piece.pos[2] + piece.from[2] * (1 - t) + 0.045);
  });
  return (
    <group ref={ref}>
      <Html center zIndexRange={[10, 0]} style={{ pointerEvents: "none", whiteSpace: "nowrap", opacity: piece ? 1 : 0, transition: "opacity .15s" }}>
        <div className="rounded-md border border-acc/60 bg-ink/90 px-2 py-1 text-xs text-slate-100 shadow-lg">
          {piece?.label}{piece?.price !== undefined && <span className="ml-1 text-slate-400">${piece.price.toFixed(2)}</span>}
        </div>
      </Html>
    </group>
  );
}

function Spin({ children, on }: { children: React.ReactNode; on: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (on && ref.current) ref.current.rotation.z += dt * 0.25; });
  return <group ref={ref}>{children}</group>;
}

function Player({ pieces, playing, onDone }: { pieces: Piece[]; playing: boolean; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const pRef = useRef(0);
  useFrame((_, dt) => {
    if (!playing) return;
    pRef.current = Math.min(1.15, pRef.current + dt / 7);  // ~8 s full assembly
    setProgress(pRef.current);
    if (pRef.current >= 1.15) onDone();
  });
  return <Spin on={progress >= 1.1}><RobotModel pieces={pieces} progress={Math.min(1, progress)} labels /></Spin>;
}

/** Panel: exploded parts fly in and assemble into the full robot. */
export function AssemblyViewer({ spec, parts, body, board, status, className, onDone }: { spec: RobotSpec | null; parts: PartsSelection | null; body: BodyArtifact | null; board: BoardArtifact | null; status?: string; className?: string; onDone?: () => void }) {
  const pieces = useMemo(() => buildPieces(spec, parts, body, board), [spec, parts, body, board]);
  const [key, setKey] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ready = Boolean(parts && body);
  const named = pieces.filter((p) => p.label).length;
  return (
    <div className={`panel relative overflow-hidden ${className ?? "h-[520px]"}`}>
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <span className="rounded-lg bg-acc px-3 py-1 text-sm font-bold text-white">Assembly</span>
        <span className="text-xs text-slate-300">{ready ? `${named} components → ${spec?.template.replace(/_/g, " ")}` : (status === "planning" ? "planning…" : "waiting for parts and body…")}</span>
      </div>
      <button onClick={() => { setKey((k) => k + 1); setPlaying(true); }} className="absolute right-3 top-3 z-10 rounded-lg border border-line bg-panel/80 px-3 py-1 text-xs hover:border-acc">Replay</button>
      <Canvas key={key} shadows camera={{ position: [0.3, -0.36, 0.22], up: [0, 0, 1], fov: 38 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[1, -1, 2]} intensity={1.4} castShadow />
        <directionalLight position={[-1, 1, 1]} intensity={0.4} />
        <Grid args={[2, 2]} cellSize={0.05} sectionSize={0.25} rotation={[Math.PI / 2, 0, 0]} cellColor="#2a3142" sectionColor="#3b82f6" fadeDistance={2} position={[0, 0, -((body?.wheel_diameter_mm ?? 60) / 2000)]} />
        <ContactShadows position={[0, 0, -((body?.wheel_diameter_mm ?? 60) / 2000) + 0.001]} rotation={[Math.PI / 2, 0, 0]} opacity={0.5} scale={1} blur={2} />
        {ready && <Player pieces={pieces} playing={playing} onDone={() => { setPlaying(false); onDone?.(); }} />}
        <OrbitControls target={[0.03, 0, 0.03]} enablePan={false} minDistance={0.2} maxDistance={1.5} />
      </Canvas>
    </div>
  );
}
