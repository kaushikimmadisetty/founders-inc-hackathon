"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BodyArtifact, BoardArtifact, PartsSelection, RobotSpec, SimReport, Trajectory } from "@/lib/types";
import { RobotModel, buildPieces } from "./Robot3D";

/** Replays trajectory.json. Geometry mirrors the MJCF primitives (box chassis,
 *  cylinder wheels), scene drawn from the task id. No meshes needed. */
export function Viewer3D({ report, spec, body, parts, board, className }: { report: SimReport; spec: RobotSpec | null; body: BodyArtifact | null; parts?: PartsSelection | null; board?: BoardArtifact | null; className?: string }) {
  const pieces = useMemo(() => buildPieces(spec, parts ?? null, body, board ?? null), [spec, parts, body, board]);
  const followRef = useRef(new THREE.Vector3(0, 0, 0));
  const [traj, setTraj] = useState<Trajectory | null>(null);
  useEffect(() => {
    if (!report.trajectory_url) return;
    fetch(report.trajectory_url).then((r) => r.json()).then(setTraj).catch(() => setTraj(null));
  }, [report.trajectory_url]);

  const wheelR = (body?.wheel_diameter_mm ?? 60) / 2000;
  const taskId = spec?.task.id ?? "drive_loop";

  return (
    <div className={`panel relative overflow-hidden ${className ?? "h-[520px]"}`}>
      <div className={`absolute left-3 top-3 z-10 rounded-lg px-3 py-1 text-sm font-bold ${report.passed ? "bg-ok text-black" : "bg-bad text-white"}`}>
        Attempt {report.iteration}: {report.passed ? "passed" : report.failure_class.replace(/_/g, " ")}
      </div>
      {!report.passed && <p className="absolute bottom-3 left-3 right-3 z-10 truncate text-xs text-slate-300">{report.failure_detail}</p>}
      <Canvas shadows camera={{ position: [-0.9, -1.1, 0.7], up: [0, 0, 1], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, -2, 4]} intensity={1.2} />
        <Grid args={[6, 6]} cellSize={0.1} sectionSize={0.5} rotation={[Math.PI / 2, 0, 0]} cellColor="#2a3142" sectionColor="#3b82f6" fadeDistance={6} />
        <Scene taskId={taskId} />
        <Robot traj={traj} wheelR={wheelR} template={traj?.template ?? spec?.template ?? "diff_drive_rover"} follow={followRef}>
          <RobotModel pieces={pieces} />
        </Robot>
        <FollowControls follow={followRef} />
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

/** OrbitControls whose target eases toward the robot so the camera tracks it. */
function FollowControls({ follow }: { follow: React.MutableRefObject<THREE.Vector3> }) {
  const ref = useRef<any>(null);
  useFrame(() => {
    const c = ref.current;
    if (!c) return;
    const prev = c.target.clone();
    c.target.lerp(follow.current, 0.08);
    c.object.position.add(c.target.clone().sub(prev));
    c.update();
  });
  return <OrbitControls ref={ref} target={[0, 0, 0]} enablePan={false} minDistance={0.3} maxDistance={4} />;
}

function Robot({ traj, wheelR, template, children, follow }: { traj: Trajectory | null; wheelR: number; template: string; children: React.ReactNode; follow: React.MutableRefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Group>(null);
  const frame = useRef(0);
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
    follow.current.copy(ref.current.position);
  });
  return <group ref={ref} position={[0, 0, wheelR]}>{children}</group>;
}
