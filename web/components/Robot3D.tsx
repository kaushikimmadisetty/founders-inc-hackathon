"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { boardPiece, identity, partFor } from "@/lib/partRefs";
import { CameraRig, PartTooltip, useViewport, ViewportTools, type PartHover, type PartInteraction } from "./ViewportControls";
import { useMemo, useRef, useState } from "react";
import { BlueprintFloor, StudioLights } from "./BlueprintFloor";
import { BoardArtifact, BodyArtifact, PartsSelection, RobotSpec } from "@/lib/types";

/** Full robot built from the real spec/parts/body/board, as the same primitives
 *  MuJoCo uses. `progress` 0..1 explodes/assembles it; each part has a stagger
 *  window so they fly in one at a time. Units: metres, z up (MuJoCo frame). */

export type Piece = {
  id: string; label: string; ref?: string; price?: number;
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
  const tray = "#5b7fb5";
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
      pos: [x, side * (W / 2 - md[2] / 2 - wall), wr * 0.6 + 0.004], size: [md[0] / 2, md[2], md[1]], shape: "cyl", rot: [0, 0, 0], color: "#b8bcc4", from: [x, side * 0.5, 0.25], order: order + i });
  });
  order += wheelPos.length;
  const wheel = byRole("wheel");
  wheelPos.forEach(([x, y], i) => {
    pieces.push({ id: `wheel${i}`, label: i === 0 ? `${wheel?.qty ?? wheelPos.length}× ${wheel?.name ?? "wheel"}` : "", price: i === 0 && wheel ? wheel.unit_price_usd * wheel.qty : undefined,
      pos: [x, y, 0], size: [wr, mecanum ? 0.03 : 0.02, 0], shape: "cyl", rot: [0, 0, 0], color: "#1b1d22", from: [x, Math.sign(y) * 0.7, 0.05], order: order + i });
  });
  order += wheelPos.length;
  if (!mecanum) {
    const caster = byRole("caster");
    pieces.push({ id: "caster", label: caster?.name ?? "ball caster", price: caster?.unit_price_usd, pos: [-L * 0.4, 0, -(wr - 0.012)], size: [0.012, 0, 0], shape: "sphere", color: "#666", from: [-0.5, 0, -0.1], order: order++ });
  }

  // battery (clamped inside), centred low
  const bat = byRole("battery");
  const bd = mm(bat, [0.07, 0.035, 0.015]).map((v, i) => Math.min(v, [L * 0.6, W * 0.8, H * 0.8][i])) as [number, number, number];
  pieces.push({ id: "battery", label: bat?.name ?? "battery", price: bat?.unit_price_usd, pos: [-0.02, 0, wall + bd[2] / 2], size: bd, shape: "box", color: "#30343c", from: [-0.02, 0, 0.6], order: order++ });

  // PCB plate + MCU + drivers + regulator
  const pcb = board?.outline_mm ?? [80, 60];
  const pl = Math.min(pcb[0] / 1000, L - 2 * wall - 0.01), pw = Math.min(pcb[1] / 1000, W - 2 * wall - 0.01);
  const pcbZ = wall + bd[2] + 0.006;
  pieces.push({ id: "pcb", label: `Carrier PCB ${pcb[0]}×${pcb[1]} mm (${board?.provider ?? "pending"})`, pos: [L / 2 - pl / 2 - 0.012, 0, pcbZ], size: [pl, pw, 0.0016], shape: "box", color: "#1f6b45", from: [0.1, 0, 0.7], order: order++ });
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
    pieces.push({ id: "camera", label: cam.name, price: cam.unit_price_usd, pos: [L / 2 - 0.015, 0, H + cd[2] / 2], size: [0.024, 0.024, cd[2]], shape: "box", color: "#111", from: [0.5, 0, 0.4], order: order++ });
  }
  const tof = byRole("tof");
  if (tof && spec?.sensors.some((s) => s.startsWith("tof"))) {
    pieces.push({ id: "tof", label: tof.name, price: tof.unit_price_usd, pos: [L / 2 + 0.002, 0, H * 0.5], size: [0.004, 0.018, 0.013], shape: "box", color: "#1e293b", from: [0.6, 0, 0.1], order: order++ });
  }

  // arm
  if (template === "mecanum_arm") {
    const servo = byRole("servo"); const grip = byRole("gripper");
    const reach = (spec?.params.arm_reach_mm ?? 150) / 1000;
    const ax = L * 0.3, az = H;
    pieces.push({ id: "servo1", label: `${servo?.qty ?? 3}× ${servo?.name ?? "servo"}`, price: servo ? servo.unit_price_usd * servo.qty : undefined, pos: [ax, 0, az + 0.01], size: [0.015, 0.02, 0], shape: "cyl", rot: [Math.PI / 2, 0, 0], color: "#d1d5db", from: [ax, 0, 0.9], order: order++ });
    pieces.push({ id: "link1", label: "arm link 1", pos: [ax + reach * 0.25, 0, az + 0.02], size: [reach * 0.5, 0.016, 0.016], shape: "box", color: "#e5e7eb", from: [ax + 0.3, 0, 0.9], order: order++ });
    pieces.push({ id: "servo2", label: "", pos: [ax + reach * 0.5, 0, az + 0.02], size: [0.012, 0.02, 0], shape: "cyl", rot: [Math.PI / 2, 0, 0], color: "#d1d5db", from: [ax + 0.4, 0, 1.0], order });
    pieces.push({ id: "link2", label: "arm link 2", pos: [ax + reach * 0.75, 0, az + 0.02], size: [reach * 0.5, 0.014, 0.014], shape: "box", color: "#e5e7eb", from: [ax + 0.5, 0, 1.0], order: order++ });
    pieces.push({ id: "servo3", label: servo?.name ?? "Wrist servo", pos: [ax + reach, 0, az + 0.02], size: [0.009, 0.018, 0], shape: "cyl", color: "#b8bcc4", from: [ax + 0.6, 0, 1], order: order++ });
    pieces.push({ id: "gripL", label: grip?.name ?? "gripper", price: grip?.unit_price_usd, pos: [ax + reach + 0.02, 0.018, az + 0.02], size: [0.04, 0.006, 0.02], shape: "box", color: "#8b949e", from: [ax + 0.7, 0.2, 1.0], order: order++ });
    pieces.push({ id: "gripR", label: "", pos: [ax + reach + 0.02, -0.018, az + 0.02], size: [0.04, 0.006, 0.02], shape: "box", color: "#8b949e", from: [ax + 0.7, -0.2, 1.0], order });
  }
  // Connector blocks and any remaining BOM entries remain individually selectable.
  const headerLines = board?.bom_lines.filter(line => /^J/i.test(line.ref)) ?? [];
  const extras = board?.bom_lines.filter(line => boardPiece(line, parts?.parts ?? []).startsWith("bom:")) ?? [];
  [...headerLines, ...extras].forEach((line, i) => {
    const id = boardPiece(line, parts?.parts ?? []);
    const x = L / 2 - pl / 2 - 0.012 - pl * .3 + (i % 4) * pl * .2;
    const y = -pw * .36 + Math.floor(i / 4) * .009;
    pieces.push({ id, label: line.part, price: line.unit_price_usd, pos: [x, y, pcbZ + .004], size: [.009, .007, .006], shape: "box", color: "#dadad0", from: [0, 0, .1 + i * .015], order: order++ });
  });
  return pieces.map(p => ({ ...p, ref: board?.bom_lines.find(line => boardPiece(line, parts?.parts ?? []) === p.id)?.ref ?? partFor(p.id, parts?.parts ?? [])?.ref ?? identity(p.id).ref, label: partFor(p.id, parts?.parts ?? [])?.name ?? (p.label || (identity(p.id).role === "chassis" ? "Printed chassis wall" : identity(p.id).role)) }));
}

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

export function pieceStart(p: Piece, total: number) { return (p.order / Math.max(total, 1)) * 0.8; }

function PieceMesh({ p, progress, total, selected, onSelect, onHover }: { p: Piece; progress: number; total: number } & PartInteraction) {
  // stagger: piece k assembles over [start, start + 0.3]
  const start = pieceStart(p, total);
  const t = ease((progress - start) / 0.3);
  const offset = progress === 0 ? explodedOffset(p) : p.from;
  const position: [number, number, number] = [p.pos[0] + offset[0] * (1 - t), p.pos[1] + offset[1] * (1 - t), p.pos[2] + offset[2] * (1 - t)];
  const geom = p.shape === "box" ? <boxGeometry args={p.size} /> : p.shape === "cyl" ? <cylinderGeometry args={[p.size[0], p.size[0], p.size[1], 28]} /> : <sphereGeometry args={[p.size[0], 16, 16]} />;
  const rot = p.rot ?? (p.shape === "cyl" ? [0, 0, 0] : [0, 0, 0]);
  const picked = !!selected && identity(selected).ref === identity(p.id).ref;
  const metal = p.id.startsWith("motor") || p.id.startsWith("servo") || p.id.startsWith("grip");
  const wheel = p.id.startsWith("wheel");
  return (
    <mesh onPointerOver={e => { e.stopPropagation(); onHover?.({ label: `${identity(p.id).ref} ${p.label}`, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }} onPointerMove={e => { e.stopPropagation(); onHover?.({ label: `${identity(p.id).ref} ${p.label}`, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }} onPointerOut={() => onHover?.(null)} onClick={e => { e.stopPropagation(); onSelect?.(p.id); }} position={position} rotation={rot as [number, number, number]} castShadow receiveShadow>
      {geom}
      <meshStandardMaterial color={p.color} transparent opacity={1} roughness={wheel ? 0.9 : metal ? 0.35 : p.id === "pcb" ? 0.38 : 0.6} metalness={metal ? 0.8 : p.id === "pcb" ? 0.18 : 0.05} emissive={picked ? "#3b82f6" : "#000000"} emissiveIntensity={picked ? 0.45 : 0} />
      {wheel && <>
        {[-1, 1].map(side => <group key={side} position={[0, side * (p.size[1] / 2 + 0.0005), 0]}><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[p.size[0] * 0.84, 0.0009, 8, 40]} /><meshStandardMaterial color="#7b828b" roughness={0.75} /></mesh><mesh><cylinderGeometry args={[p.size[0] * 0.36, p.size[0] * 0.36, 0.0015, 24]} /><meshStandardMaterial color="#aeb5bf" metalness={0.7} roughness={0.4} /></mesh></group>)}
      </>}
      {p.id === "battery" && <mesh position={[0, 0, p.size[2] / 2 + 0.0002]}><boxGeometry args={[p.size[0] * 0.8, 0.005, 0.0004]} /><meshStandardMaterial color="#bda34c" roughness={0.7} /></mesh>}
      {p.id === "pcb" && <>{Array.from({ length: 12 }, (_, i) => <group key={i} position={[-p.size[0] * 0.42 + i * p.size[0] * 0.076, p.size[1] * 0.4, 0.001]}><mesh><boxGeometry args={[0.003, 0.005, 0.0005]} /><meshStandardMaterial color="#bb8c50" metalness={0.75} roughness={0.32} /></mesh><mesh position={[0, -0.005, 0]}><boxGeometry args={[0.002, 0.001, 0.0005]} /><meshStandardMaterial color="#edf3e8" /></mesh></group>)}</>}
      {p.id === "camera" && <mesh position={[p.size[0] / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.007, 0.008, 0.004, 24]} /><meshStandardMaterial color="#242b37" metalness={0.5} roughness={0.16} /></mesh>}
    </mesh>
  );
}

/** Static by default; progress changes only during an explicit Build action. */
export function RobotModel({ pieces, progress = 1.15, ...interaction }: { pieces: Piece[]; progress?: number } & PartInteraction) {
  const total = Math.max(...pieces.map(p => p.order), 1) + 1;
  return <group>{pieces.map(p => <group key={p.id}><PieceMesh p={p} progress={progress} total={total} {...interaction} />{progress === 0 && <><Line points={[p.pos, explodedPosition(p)]} color="#8e9ba8" lineWidth={1} /><Html position={explodedPosition(p)} center zIndexRange={[15, 0]}><button className="exploded-label" onClick={e => { e.stopPropagation(); interaction.onSelect?.(p.id); }}>{p.ref ?? identity(p.id).ref}</button></Html></>}</group>)}</group>;
}

export function explodedOffset(p: Piece): [number, number, number] {
  if (/^(motor|wheel)/.test(p.id)) return [0, Math.sign(p.pos[1]) * (p.id.startsWith("wheel") ? .15 : .075), 0];
  if (p.id.startsWith("wall-x")) return [Math.sign(p.pos[0]) * .055, 0, 0];
  if (p.id.startsWith("wall-y")) return [0, Math.sign(p.pos[1]) * .055, 0];
  if (p.id === "floor" || p.id === "caster") return [0, 0, -.06];
  if (p.id === "battery") return [-.11, 0, .07];
  if (p.id === "pcb") return [0, 0, .10];
  if (/^(mcu|drv|reg|imu|header|bom:)/.test(p.id)) return [0, 0, .18 + (p.order % 3) * .025];
  return [.06 + (p.order % 4) * .045, 0, .15 + (p.order % 3) * .04];
}
function explodedPosition(p: Piece): [number, number, number] { const d = explodedOffset(p); return [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]]; }
function isBoardPiece(p: Piece) { return /^(pcb$|mcu$|drv|reg$|imu$|header|bom:)/.test(p.id); }
function BoardLabels({ pieces, board, parts, exploded, onSelect }: { pieces: Piece[]; board: BoardArtifact | null; parts: PartsSelection | null; exploded: boolean } & PartInteraction) {
  return <>{board?.bom_lines.map(line => {
    const p = pieces.find(piece => piece.id === boardPiece(line, parts?.parts ?? []));
    if (!p) return null;
    const position = exploded ? explodedPosition(p) : p.pos;
    return <Html key={line.ref} position={[position[0], position[1], position[2] + p.size[2] / 2 + .003]} center zIndexRange={[16, 0]}><button className="board-label" title={`${line.ref} · ${line.part}`} onClick={e => { e.stopPropagation(); onSelect?.(p.id); }}>{line.ref}</button></Html>;
  })}</>;
}

type ViewMode = "play" | "assembled" | "exploded";

function Player({ pieces, onDone, mode, ...interaction }: { pieces: Piece[]; onDone: () => void; mode: ViewMode } & PartInteraction) {
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const ended = useRef(false);
  useFrame((_, dt) => {
    if (mode !== "play" || ended.current) return;
    elapsed.current = Math.min(1.5, elapsed.current + dt);
    setProgress(elapsed.current / 1.5 * 1.15);
    if (elapsed.current >= 1.5) { ended.current = true; onDone(); }
  });
  return <RobotModel pieces={pieces} progress={mode === "assembled" ? 1.15 : mode === "exploded" ? 0 : progress} {...interaction} />;
}

/** Still assembly. Build is a one-shot, presenter-triggered 1.5 second action. */
export function AssemblyViewer({ spec, parts, body, board, className, onDone, selected, onSelect, viewport }: { spec: RobotSpec | null; parts: PartsSelection | null; body: BodyArtifact | null; board: BoardArtifact | null; className?: string; onDone?: () => void; viewport?: ReturnType<typeof useViewport> } & PartInteraction) {
  const pieces = useMemo(() => buildPieces(spec, parts, body, board), [spec, parts, body, board]);
  const [key, setKey] = useState(0);
  const [mode, setMode] = useState<ViewMode>("assembled");
  const localControls = useViewport();
  const controls = viewport ?? localControls;
  const [hover, setHover] = useState<PartHover>(null);
  const boardOnly = controls.view.preset === "Board";
  const shown = boardOnly ? pieces.filter(isBoardPiece) : pieces;
  const pcb = pieces.find(p => p.id === "pcb");
  const center: [number, number, number] = boardOnly && pcb ? pcb.pos : [0, 0, .04];
  return (
    <div className={`panel relative overflow-hidden ${className ?? "h-[520px]"}`}>
      <ViewportTools controls={controls} exploded={mode === "exploded"} onExplode={() => setMode(m => m === "exploded" ? "assembled" : "exploded")} />
      <div className="assembly-modes segment">
        {([["play", "Build"], ["assembled", "Assembled"], ["exploded", "Exploded"]] as [ViewMode, string][]).map(([m, l]) => <button key={m} disabled={m === "play" && mode === "play"} aria-pressed={mode === m} onClick={() => { if (m === "play") { setKey(k => k + 1); } setMode(m); }} className={mode === m ? "active" : ""}>{l}</button>)}
      </div>
      <PartTooltip hover={hover} />
      <Canvas onPointerMissed={() => onSelect?.(null)} shadows camera={{ position: [0.3, -0.36, 0.22], up: [0, 0, 1], fov: 38 }}>
        <StudioLights />
        <BlueprintFloor height={-((body?.wheel_diameter_mm ?? 60) / 2000)} />
        <Player key={`${key}-${boardOnly}`} pieces={shown} onDone={() => { setMode("assembled"); onDone?.(); }} mode={mode} selected={selected} onSelect={onSelect} onHover={setHover} />
        {boardOnly && <BoardLabels pieces={shown} board={board} parts={parts} exploded={mode === "exploded"} onSelect={onSelect} />}
        <CameraRig key={`${boardOnly}-${mode === "exploded"}`} view={controls.view} center={mode === "exploded" ? [center[0], center[1], center[2] + .08] : center} radius={mode === "exploded" ? .42 : boardOnly && pcb ? Math.hypot(pcb.size[0], pcb.size[1]) * .65 : Math.max(0.18, ...pieces.map(p => Math.hypot(...p.pos) + Math.max(...p.size) / 2))} />
      </Canvas>
    </div>
  );
}
