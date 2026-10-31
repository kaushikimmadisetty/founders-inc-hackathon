import { BACKEND } from "./types";

/** Start a run from a web prompt and return its id. */
export async function startRun(prompt: string): Promise<string> {
  const r = await fetch(`${BACKEND}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, source: "web" }) });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.run_id;
}
