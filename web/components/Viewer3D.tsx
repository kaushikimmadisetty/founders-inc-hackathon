"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BodyArtifact, RobotSpec, SimReport, Trajectory } from "@/lib/types";

/** Replays trajectory.json. Geometry mirrors the MJCF primitives (box chassis,
 *  cylinder wheels), scene drawn from the task id. No meshes needed. */
export function Viewer3D({ report, spec, body }: { report: SimReport; spec: RobotSpec | null; body: BodyArtifact | null }) {
  const [traj, setTraj] = useState<Trajectory | null>(null);
  useEffect(() => {
    if (!report.trajectory_url) return;
    fetch(report.trajectory_url).then((r) => r.json()).then(setTraj).catch(() => setTraj(null));
  }, [report.trajectory_url]);

  const dims = body?.dims_mm ?? [200, 160, 60];
  const wheelR = (body?.wheel_diameter_mm ?? 60) / 2000;
  const taskId = spec?.task.id ?? "drive_loop";

  return (
    <div className="panel relative h-[420px] overflow-hidden">
      <div className={`absolute left-3 top-3 z-10 rounded-lg px-3 py-1 text-sm font-bold ${report.passed ? "bg-ok text-black" : "bg-bad text-white"}`}>
        Attempt {report.iteration}: {report.passed ? "passed" : report.failure_class.replace(/_/g, " ")}
      </div>
      {!report.passed && <p className="absolute bottom-3 left-3 right-3 z-10 truncate text-xs text-slate-300">{report.failure_detail}</p>}
      <Canvas camera={{ position: [1.2, -1.6, 1.1], up: [0, 0, 1], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, -2, 4]} intensity={1.2} />
        <Grid args={[6, 6]} cellSize={0.1} sectionSize={0.5} rotation={[Math.PI / 2, 0, 0]} cellColor="#2a3142" sectionColor="#3b82f6" fadeDistance={6} />
        <Scene taskId={taskId} />
        <Robot traj={traj} dims={dims} wheelR={wheelR} template={traj?.template ?? spec?.template ?? "diff_drive_rover"} />
        <OrbitControls target={[1, 0, 0]} />
      </Canvas>
      {!traj && <p className="absolute inset-0 flex items-center justify-center text-slate-500">loading trajectory…</p>}
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

function Robot({ traj, dims, wheelR, template }: { traj: Trajectory | null; dims: number[]; wheelR: number; template: string }) {
  const ref = useRef<THREE.Group>(null);
  const frame = useRef(0);
  const [L, W, H] = dims.map((d) => d / 1000);
  const isMecanum = template !== "diff_drive_rover";
  useFrame((_, dt) => {
    if (!traj || !ref.current || traj.frames.length === 0) return;
    frame.current = (frame.current + dt * traj.fps) % traj.frames.length;
    const q = traj.frames[Math.floor(frame.current)];
    if (isMecanum) {
      ref.current.position.set(q[0], q[1], wheelR);
      ref.current.rotation.set(0, 0, q[2]);
    } else {
      ref.current.position.set(q[0], q[1], q[2]);
      ref.current.quaternion.set(q[4], q[5], q[6], q[3]); // mujoco wxyz -> three xyzw
    }
  });
  const wheels: [number, number][] = isMecanum
    ? [[L * 0.35, W / 2 + 0.017], [L * 0.35, -(W / 2 + 0.017)], [-L * 0.35, W / 2 + 0.017], [-L * 0.35, -(W / 2 + 0.017)]]
    : [[L * 0.25, W / 2 + 0.012], [L * 0.25, -(W / 2 + 0.012)]];
  return (
    <group ref={ref} position={[0, 0, wheelR]}>
      <mesh position={[0, 0, H / 2]}><boxGeometry args={[L, W, H]} /><meshStandardMaterial color="#3b82f6" /></mesh>
      {wheels.map(([x, y], i) => <mesh key={i} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelR, wheelR, 0.02, 24]} /><meshStandardMaterial color="#111" /></mesh>)}
      {!isMecanum && <mesh position={[-L * 0.4, 0, -(wheelR - 0.012)]}><sphereGeometry args={[0.012]} /><meshStandardMaterial color="#555" /></mesh>}
      {template === "mecanum_arm" && <mesh position={[L * 0.3 + 0.075, 0, H + 0.02]}><boxGeometry args={[0.15, 0.016, 0.016]} /><meshStandardMaterial color="#ccc" /></mesh>}
    </group>
  );
}
