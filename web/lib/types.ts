// Mirrors backend/models.py. Keep in sync.
export type Template = "diff_drive_rover" | "mecanum_base" | "mecanum_arm";
export type TaskId = "drive_loop" | "fetch_under_obstacle" | "ramp_climb" | "pick_and_place";
export type AgentName = "planner" | "parts" | "body" | "board" | "brain" | "assembler" | "sim" | "critic";
export type RunStatus = "planning" | "building" | "simulating" | "revising" | "passed" | "failed";
export type RouteTo = "parts" | "body" | "board" | "brain" | "none";

export interface Part {
  role: string; qty: number; name: string; mass_g: number;
  stall_torque_nm?: number | null; rated_rpm?: number | null; stall_current_a?: number | null;
  dims_mm: [number, number, number]; unit_price_usd: number; url: string; source: "firecrawl" | "catalog";
}
export interface PartsSelection { parts: Part[]; total_usd: number; total_mass_g: number }
export interface BodyArtifact {
  chassis_stl_url?: string | null; chassis_step_url?: string | null; dims_mm: [number, number, number];
  wheel_diameter_mm: number; chassis_mass_g: number;
}
export interface BomLine { ref: string; part: string; qty: number; unit_price_usd: number }
export interface BoardArtifact {
  provider: "heypcb" | "fallback"; outline_mm: [number, number]; mount_holes_mm: [number, number][];
  bom_lines: BomLine[]; render_png_url?: string | null; gerbers_zip_url?: string | null; enclosure_stl_url?: string | null;
}
export interface ControllerArtifact { source: string; origin: "llm" | "fallback"; controller_url?: string | null; static_check_ok: boolean; static_check_msg: string }
export interface SimMetrics {
  time_s: number; reached_target: boolean; min_clearance_mm: number; max_tilt_deg: number; energy_wh: number;
  motor_saturation_pct: number; collisions: string[]; total_mass_kg: number; total_cost_usd: number;
}
export interface SimReport {
  iteration: number; passed: boolean; metrics: SimMetrics; failure_class: string; failure_detail: string;
  route_to: RouteTo; gif_url?: string | null; trajectory_url?: string | null; mjcf_url?: string | null;
}
export interface CriticVerdict { failure_class: string; route_to: RouteTo; instruction: string; summary: string }
export interface RobotSpec {
  run_id: string; user_prompt: string; template: Template; rationale: string;
  constraints: { max_height_mm: number; max_footprint_mm: [number, number]; max_mass_kg: number; budget_usd: number };
  params: { chassis_length_mm: number; chassis_width_mm: number; chassis_height_mm: number; wheel_diameter_mm: number; arm_reach_mm?: number | null };
  sensors: string[]; task: { id: TaskId; description: string; scene: string };
}
export interface RunState {
  run_id: string; prompt: string; source: string; status: RunStatus; iteration: number;
  spec?: RobotSpec | null; parts?: PartsSelection | null; body?: BodyArtifact | null; board?: BoardArtifact | null;
  brain?: ControllerArtifact | null; reports: SimReport[]; critic_history: CriticVerdict[]; error?: string | null;
}
export interface AgentEvent { runId: string; agent: AgentName; kind: "start" | "progress" | "done" | "error"; message: string; payloadJson?: string; iteration: number; ts: number }

export interface Trajectory { fps: number; template: Template; frames: number[][]; joint_names: string[]; qpos_adr: number[] }

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
