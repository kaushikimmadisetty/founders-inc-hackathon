import { RunStatus } from "@/lib/types";

const STYLE: Record<RunStatus, string> = {
  planning: "bg-slate-100 text-slate-900", building: "bg-acc/20 text-acc", simulating: "bg-warn/20 text-warn",
  revising: "bg-warn/20 text-warn", passed: "bg-ok/20 text-ok", failed: "bg-bad/20 text-bad",
};

export function StatusPill({ status }: { status?: RunStatus }) {
  if (!status) return <span className="pill bg-slate-100 text-slate-600">loading</span>;
  const live = status !== "passed" && status !== "failed";
  return (
    <span className={`pill ${STYLE[status]}`}>
      {live && <span className="h-2 w-2 animate-pulse rounded-full bg-current" />}
      {status}
    </span>
  );
}
