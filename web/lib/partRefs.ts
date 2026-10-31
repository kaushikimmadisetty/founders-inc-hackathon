import type { Part, BomLine } from "./types";

export const GROUPS: Record<string, string[]> = {
  Drive: ["drive_motor", "wheel", "caster"], Power: ["battery", "regulator"],
  Compute: ["mcu", "motor_driver", "imu"], Sensing: ["camera", "tof"],
  Arm: ["servo", "gripper"], Structure: ["chassis", "pcb", "link"],
};
export function identity(id: string): { ref: string; role: string } {
  if (id.startsWith("header")) return { ref: `J${Number(id.slice(6)) + 1}`, role: "header" };
  if (id.startsWith("motor")) return { ref: `M${Number(id.slice(5)) + 1}`, role: "drive_motor" };
  if (id.startsWith("wheel")) return { ref: `W${Number(id.slice(5)) + 1}`, role: "wheel" };
  if (id.startsWith("drv")) return { ref: `D${Number(id.slice(3)) + 1}`, role: "motor_driver" };
  if (id.startsWith("servo")) return { ref: `S${id.slice(5)}`, role: "servo" };
  if (id.startsWith("grip")) return { ref: "G1", role: "gripper" };
  if (id.startsWith("wall") || id === "floor") return { ref: "CH", role: "chassis" };
  const table: Record<string, [string, string]> = { battery: ["B1", "battery"], reg: ["R1", "regulator"], mcu: ["U1", "mcu"], pcb: ["PCB", "pcb"], imu: ["IMU", "imu"], camera: ["CAM", "camera"], tof: ["TOF", "tof"], caster: ["C1", "caster"] };
  const [ref, role] = table[id] ?? [id.toUpperCase(), id.startsWith("link") ? "link" : id];
  return { ref, role };
}
export function firstPiece(role: string) {
  return ({ drive_motor: "motor0", wheel: "wheel0", motor_driver: "drv0", servo: "servo1", gripper: "gripL", chassis: "floor", regulator: "reg" } as Record<string, string>)[role] ?? role;
}
export function partFor(id: string, parts: Part[]) { return parts.find(p => p.role === identity(id).role || p.role === id || p.ref === id); }

export function boardPiece(line: BomLine, parts: Part[]) {
  const exact = parts.find(p => p.name.toLowerCase() === line.part.toLowerCase() || p.ref === line.ref);
  if (/^J/i.test(line.ref)) return `header${Math.max(0, (parseInt(line.ref.slice(1)) || 1) - 1)}`;
  if (/^D[0-9]/i.test(line.ref)) return `drv${Math.max(0, parseInt(line.ref.slice(1)) - 1)}`;
  if (exact) return firstPiece(exact.role);
  if (/^U/i.test(line.ref)) return "mcu";
  if (/^R/i.test(line.ref)) return "reg";
  if (/imu/i.test(line.ref + line.part)) return "imu";
  return `bom:${line.ref}`;
}
