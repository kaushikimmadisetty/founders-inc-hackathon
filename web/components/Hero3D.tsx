"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid } from "@react-three/drei";
import { useRef } from "react";
import type { Group } from "three";
import { buildPieces, RobotModel } from "@/components/Robot3D";
import type { RobotSpec, PartsSelection, BodyArtifact, BoardArtifact } from "@/lib/types";

const spec: RobotSpec = {
  run_id: "hero", user_prompt: "Fetch my keys", template: "mecanum_arm", rationale: "Compact omnidirectional helper",
  constraints: { max_height_mm: 180, max_footprint_mm: [400, 300], max_mass_kg: 2, budget_usd: 250 },
  params: { chassis_length_mm: 220, chassis_width_mm: 170, chassis_height_mm: 45, wheel_diameter_mm: 60, arm_reach_mm: 150 },
  sensors: ["camera", "tof"], task: { id: "fetch_under_obstacle", description: "Fetch keys", scene: "living room" },
};
const parts: PartsSelection = {
  parts: [
    { role: "drive_motor", name: "N20 6V 100RPM gear motor", qty: 4, mass_g: 10, dims_mm: [12, 10, 34], unit_price_usd: 3.9, url: "https://www.pololu.com/product/3041", source: "catalog" },
    { role: "wheel", name: "60mm mecanum wheel", qty: 4, mass_g: 35, dims_mm: [60, 60, 30], unit_price_usd: 7.5, url: "https://www.amazon.com/dp/B08HRQ9ZXN", source: "catalog" },
    { role: "battery", name: "2S LiPo 1000mAh 7.4V", qty: 1, mass_g: 58, dims_mm: [70, 35, 15], unit_price_usd: 12, url: "https://www.amazon.com/dp/B07L9J1F4P", source: "catalog" },
    { role: "mcu", name: "ESP32-S3 DevKitC", qty: 1, mass_g: 9, dims_mm: [55, 28, 8], unit_price_usd: 9.5, url: "https://www.adafruit.com/product/5364", source: "catalog" },
    { role: "camera", name: "OV2640 ESP32-CAM module", qty: 1, mass_g: 8, dims_mm: [27, 40, 12], unit_price_usd: 8, url: "https://www.amazon.com/dp/B07S5PVZKV", source: "catalog" },
    { role: "tof", name: "VL53L0X ToF 2m", qty: 1, mass_g: 1, dims_mm: [13, 18, 3], unit_price_usd: 5, url: "https://www.pololu.com/product/2490", source: "catalog" },
    { role: "servo", name: "MG90S metal gear servo", qty: 3, mass_g: 14, dims_mm: [23, 12, 29], unit_price_usd: 4, url: "https://www.amazon.com/dp/B07L6FZVT1", source: "catalog" },
    { role: "gripper", name: "Mini servo gripper kit", qty: 1, mass_g: 40, dims_mm: [90, 60, 30], unit_price_usd: 9, url: "https://www.amazon.com/dp/B07VHKQ4YS", source: "catalog" },
  ], total_usd: 101.1, total_mass_g: 438,
};
const body: BodyArtifact = { dims_mm: [220, 170, 45], wheel_diameter_mm: 60, chassis_mass_g: 85 };
const board: BoardArtifact = { provider: "fallback", outline_mm: [80, 60], mount_holes_mm: [[4, 4], [76, 56]], bom_lines: [] };
const pieces = buildPieces(spec, parts, body, board);

function Robot() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += Math.min(dt, 0.05) * 0.16; });
  return <group ref={ref} position={[0, 0.035, 0]} rotation={[0, -0.5, 0]}>
    <group rotation={[-Math.PI / 2, 0, 0]}><RobotModel pieces={pieces} progress={1.2} /></group>
  </group>;
}

export default function Hero3D() {
  return <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0.48, 0.38, 0.55], fov: 35 }} gl={{ alpha: true, antialias: true }} aria-label="Rotating assembled mecanum robot with a gripper arm">
    <ambientLight intensity={0.8} />
    <directionalLight position={[1, 2, 1]} intensity={3} color="#dbeafe" castShadow shadow-mapSize={[1024, 1024]} />
    <pointLight position={[-0.5, 0.4, -0.4]} intensity={3} color="#3b82f6" />
    <pointLight position={[0.6, 0.2, -0.3]} intensity={1.5} color="#f59e0b" />
    <Robot />
    <ContactShadows position={[0, 0, 0]} opacity={0.65} scale={2} blur={2.8} far={0.5} resolution={256} />
    <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.05} sectionSize={0.25} cellColor="#242a38" sectionColor="#3b82f6" cellThickness={0.5} sectionThickness={0.7} fadeDistance={1.8} infiniteGrid />
  </Canvas>;
}
