"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraRig, PartTooltip, useViewport, ViewportTools, type PartHover, type PartInteraction } from "./ViewportControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { BlueprintFloor, StudioLights } from "./BlueprintFloor";
import * as THREE from "three";
import { BodyArtifact, BoardArtifact, PartsSelection, RobotSpec, SimReport, Trajectory } from "@/lib/types";
import { RobotModel, buildPieces } from "./Robot3D";

/** Replays trajectory.json. Geometry mirrors the MJCF primitives (box chassis,
 *  cylinder wheels), scene drawn from the task id. No meshes needed. */
export function Viewer3D({ report, spec, body, parts, board, className, selected, onSelect, viewport, still = false, onPlaybackEnd }: { report: SimReport; spec: RobotSpec | null; body: BodyArtifact | null; parts?: PartsSelection | null; board?: BoardArtifact | null; className?: string; viewport?: ReturnType<typeof useViewport>; still?: boolean; onPlaybackEnd?: () => void } & PartInteraction) {
  const pieces = useMemo(() => buildPieces(spec, parts ?? null, body, board ?? null), [spec, parts, body, board]);
  const localControls = useViewport();
  const controls = viewport ?? localControls;
  const [exploded, setExploded] = useState(false);
  const [hover, setHover] = useState<PartHover>(null);
  const [replay, setReplay] = useState(0);
  const [playing, setPlaying] = useState(!still);
  const [trajectoryError, setTrajectoryError] = useState(false);
  const [traj, setTraj] = useState<Trajectory | null>(null);
  useEffect(() => {
    setTraj(null); setTrajectoryError(false);
    if (!report.trajectory_url) return;
    const controller = new AbortController();
    fetch(report.trajectory_url, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("Trajectory unavailable"); return r.json(); }).then(setTraj).catch(() => { if (!controller.signal.aborted) { setTraj(null); setTrajectoryError(true); } });
    return () => controller.abort();
  }, [report.trajectory_url]);

  const framing = useMemo(() => {
    const points = traj?.frames.length ? traj.frames.map(q => new THREE.Vector3(q[0], q[1], 0)) : [new THREE.Vector3()];
    const box = new THREE.Box3().setFromPoints(points).expandByScalar(0.2);
    const center = box.getCenter(new THREE.Vector3());
    return { center: [center.x, center.y, 0.04] as [number, number, number], radius: Math.max(0.3, box.getSize(new THREE.Vector3()).length() / 2) };
  }, [traj]);
  const wheelR = (body?.wheel_diameter_mm ?? 60) / 2000;
  const taskId = spec?.task.id ?? "drive_loop";

  return (
    <div className={`panel relative overflow-hidden ${className ?? "h-[520px]"}`}>
      <div className={`viewport-status font-semibold ${report.passed ? "bg-green-50 text-ok" : "bg-red-50 text-bad"}`}>
        Attempt {report.iteration}: {report.passed ? "passed" : report.failure_class.replace(/_/g, " ")}
      </div>
      {!report.passed && <p className="sim-failure-detail">{report.failure_detail}</p>}
      <ViewportTools controls={controls} exploded={exploded} onExplode={() => setExploded(v => !v)} />
      <PartTooltip hover={hover} />
      <button disabled={!traj?.frames.length || playing} onClick={() => { setReplay(n => n + 1); setPlaying(true); }} className="replay-button">{playing ? "Playing once" : "Replay"}</button>
      <Canvas onPointerMissed={() => onSelect?.(null)} shadows camera={{ position: [-0.9, -1.1, 0.7], up: [0, 0, 1], fov: 40 }}>
        <StudioLights />
        <BlueprintFloor size={6} />
        <Scene taskId={taskId} />
        <Robot traj={traj} wheelR={wheelR} template={traj?.template ?? spec?.template ?? "diff_drive_rover"} playing={playing} replay={replay} holdLast={still && replay === 0} onEnd={() => { setPlaying(false); onPlaybackEnd?.(); }}>
          <RobotModel pieces={pieces} progress={exploded ? 0 : 1.15} selected={selected} onSelect={onSelect} onHover={setHover} />
        </Robot>
        <CameraRig key={`${traj ? "loaded" : "pending"}-${exploded}`} view={controls.view} center={framing.center} radius={exploded ? Math.max(1, framing.radius) : framing.radius} />
      </Canvas>
      {!traj && <p className="pointer-events-none absolute bottom-28 left-24 rounded-lg bg-white/90 px-3 py-2 text-sm text-slate-600">{report.trajectory_url && !trajectoryError ? "Loading trajectory…" : "Trajectory unavailable · inspect the assembled model"}</p>}
    </div>
  );
}

function Scene({ taskId }: { taskId: string }) {
  if (taskId === "fetch_under_obstacle") return (
    <group>
      <mesh position={[1.1, 0, 0.12]}><boxGeometry args={[0.9, 0.8, 0.04]} /><meshStandardMaterial color="#7a5a3a" transparent opacity={0.6} /></mesh>
      <mesh position={[1.1, 0, 0.29]}><boxGeometry args={[0.9, 0.8, 0.3]} /><meshStandardMaterial color="#5a4a40" transparent opacity={0.35} /></mesh>
      {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy], i) => <mesh key={i} position={[1.1 + sx * 0.42, sy * 0.37, 0.05]}><boxGeometry args={[0.06, 0.06, 0.1]} /><meshStandardMaterial color="#7a5a3a" /></mesh>)}
      <mesh position={[1.1, 0, 0.01]}><boxGeometry args={[0.04, 0.04, 0.02]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} /></mesh>
    </group>
  );
  if (taskId === "ramp_climb") return (
    <group>
      <mesh position={[0.9, 0, 0.121]} rotation={[0, -0.2094, 0]}><boxGeometry args={[1.2, 0.8, 0.008]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
      <mesh position={[1.787, 0, 0.125]}><boxGeometry args={[0.6, 0.8, 0.25]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
      <mesh position={[1.8, 0, 0.255]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.01]} /><meshStandardMaterial color="#ef4444" /></mesh>
    </group>
  );
  if (taskId === "pick_and_place") return (
    <group>
      <mesh position={[0.5, 0, 0.02]}><boxGeometry args={[0.04, 0.04, 0.04]} /><meshStandardMaterial color="#ef4444" /></mesh>
      <mesh position={[0.5, 0.52, 0.04]}><boxGeometry args={[0.16, 0.01, 0.08]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
      <mesh position={[0.5, 0.68, 0.04]}><boxGeometry args={[0.16, 0.01, 0.08]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
    </group>
  );
  return (
    <group>
      {[[0.6, 0.25], [1.2, -0.25], [1.8, 0.3]].map(([x, y], i) => <mesh key={i} position={[x, y, 0.15]}><boxGeometry args={[0.2, 0.2, 0.3]} /><meshStandardMaterial color="#7a5a3a" /></mesh>)}
      <mesh position={[2, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.01]} /><meshStandardMaterial color="#ef4444" /></mesh>
    </group>
  );
}

function Robot({ traj, wheelR, template, children, playing, replay, holdLast, onEnd }: { traj: Trajectory | null; wheelR: number; template: string; children: React.ReactNode; playing: boolean; replay: number; holdLast: boolean; onEnd: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const frame = useRef(0);
  const lastApplied = useRef(-1);
  useEffect(() => { frame.current = 0; lastApplied.current = -1; }, [replay, traj]);
  const isMecanum = template !== "diff_drive_rover";
  useFrame((_, dt) => {
    if (!traj || !ref.current || traj.frames.length === 0) return;
    const last = traj.frames.length - 1;
    if (holdLast) frame.current = last;
    else if (playing) frame.current = Math.min(last, frame.current + dt * traj.fps);
    const index = Math.floor(frame.current);
    if (index === lastApplied.current) return;
    lastApplied.current = index;
    const q = traj.frames[index];
    if (isMecanum) {
      ref.current.position.set(q[0], q[1], wheelR);
      ref.current.rotation.set(0, 0, q[2]);
    } else {
      ref.current.position.set(q[0], q[1], q[2]);
      ref.current.quaternion.set(q[4], q[5], q[6], q[3]); // mujoco wxyz -> three xyzw
    }
    if (playing && frame.current >= last) onEnd();
  });
  return <group ref={ref} position={[0, 0, wheelR]}>{children}</group>;
}
