"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGallery, type GalleryItem } from "@/lib/gallery";
import { startRun } from "@/lib/runs";
import { StillThumbnail } from "@/components/Gallery";

const PHONE = process.env.NEXT_PUBLIC_PHOTON_NUMBER ?? "";
const smsHref = PHONE ? `sms:${PHONE.replace(/[^\d+]/g, "")}` : undefined;

/** Leader-line ends in the exploded drawing, as % of its 736×760 frame. */
const CALLOUTS = [
  { n: "04", x: 74.5, y: 12.6, side: "right", title: "Arm + gripper", sub: "2× servo · parallel jaw", short: "Arm" },
  { n: "03", x: 76.1, y: 34.5, side: "right", title: "Carrier PCB", sub: "ESP32-S3 · via HeyPCB", short: "PCB" },
  { n: "02", x: 23.9, y: 39.5, side: "left", title: "LiPo 3S battery", sub: "11.1 V pack", short: "LiPo" },
  { n: "01", x: 20.4, y: 68.4, side: "left", title: "Mecanum ×4", sub: "N20 gearmotors", short: "Wheel" },
] as const;

const ATTEMPTS = [
  { n: "01", pass: false, img: "sim1", verdict: "Too tall to fit under the couch.", rows: [["clearance", "−16 mm", true], ["chassis height", "96 mm"], ["task time", "stalled at 6.2 s"]], route: "Critic → Body agent", fix: "Lower the deck to 72 mm. Drop the sensor mast, move the ToF to the front bumper." },
  { n: "02", pass: false, img: "sim2", verdict: "Fits now. Then drops the keys.", rows: [["grip force", "1.2 N / 2.0 req.", true], ["clearance", "+8 mm"], ["task time", "keys lost at 28.4 s"]], route: "Critic → Brain agent", fix: "Close the gripper to 70% before lifting. Back out at half speed." },
  { n: "03", pass: true, img: "sim3", verdict: "Keys home in 41.8 seconds.", rows: [["task time", "41.8 s", true], ["clearance", "+8 mm"], ["result", "build pack sent"]], route: "Shipped → your phone", fix: "GIF, chassis STL + STEP, Gerbers, controller.py and a sourced BOM." },
] as const;

const AGENTS = [
  ["Planner", "Reads your text, picks a template and a task to test against.", "RobotSpec.json", "Claude"],
  ["Parts", "Sources in-stock parts with live prices and masses.", "bom.csv", "Claude + Firecrawl"],
  ["Body", "Generates a printable chassis sized around the parts.", "chassis.stl · .step", "CadQuery"],
  ["Board", "Lays out and routes a carrier PCB for the electronics.", "gerbers.zip", "HeyPCB"],
  ["Brain", "Writes the controller, statically checked and sandboxed.", "controller.py", "Claude"],
  ["Critic", "Reads the sim report and routes one fix to one agent.", "verdict → route_to", "MuJoCo + Claude"],
];

const FILES = [
  ["bom.csv", "Every part, in stock, with vendor links"],
  ["chassis.stl · .step", "Printable chassis, ready for the slicer"],
  ["gerbers.zip", "Routed carrier board, ready for fab"],
  ["controller.py", "The exact code that passed the sim"],
  ["robot.mjcf + sim.gif", "Sim model and the replay of the pass"],
];

const EXAMPLES: GalleryItem[] = [
  { id: "example-0", type: "robot", title: "a robot that fetches my keys from under the couch", category: "mecanum arm", maker: "RoboForge", thumbnail_url: "/landing/thumb-arm.svg" },
  { id: "example-1", type: "robot", title: "a little rover that patrols my apartment at night", category: "diff drive rover", maker: "RoboForge", thumbnail_url: "/landing/thumb-rover.svg" },
  { id: "example-2", type: "robot", title: "a warehouse bot for tight aisles", category: "mecanum base", maker: "RoboForge", thumbnail_url: "/landing/thumb-base.svg" },
];

function Logo() {
  return <span className="lp-logo" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="4.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="6" cy="8.5" r="1.1" fill="currentColor" /><circle cx="10" cy="8.5" r="1.1" fill="currentColor" /><path d="M8 4.5V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span>;
}
const Arrow = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Download = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.5v8m0 0L4.5 7M8 10.5 11.5 7M3 13.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Eyebrow({ n, children }: { n: string; children: React.ReactNode }) {
  return <p className="lp-eyebrow">§ {n} — {children}</p>;
}

function PromptForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim() || "a robot that fetches my keys from under the couch";
    setBusy(true); setErr(null);
    try { router.push(`/run/${await startRun(text)}`); }
    catch (error) { setErr(String(error)); setBusy(false); }
  }
  return <form className="lp-prompt" onSubmit={go}>
    <div className="lp-prompt-bar">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 4.5C3 3.67 3.67 3 4.5 3h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H8l-3.5 3v-3C3.67 12 3 11.33 3 10.5v-6Z" stroke="#1F4FFF" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      <label htmlFor="lp-prompt" className="sr-only">Describe your robot</label>
      <input id="lp-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="fetch my keys from under the couch" />
      <button type="submit" disabled={busy}>{busy ? "Starting…" : "Forge it"} <Arrow /></button>
    </div>
    {PHONE && <p className="lp-prompt-alt">or text it · <a href={smsHref}>iMessage {PHONE}</a></p>}
    {err && <p role="alert" className="lp-error">{err}</p>}
  </form>;
}

function Hero({ robots }: { robots?: number }) {
  return <section className="lp-hero">
    <div className="lp-hero-copy">
      <p className="lp-status"><i />Sim gate online{robots ? <span> — {robots} {robots === 1 ? "robot" : "robots"} built so far</span> : null}</p>
      <h1 className="lp-display">Text a robot idea.<br /><em>Get a tested</em><br />robot back.</h1>
      <p className="lp-lede">Designed from real, orderable parts. Proven in MuJoCo physics before it ships. Delivered to your phone as a GIF and a complete build pack.</p>
      <PromptForm />
    </div>
    <figure className="lp-sheet lp-grid" aria-label="Exploded assembly of a mecanum robot with an arm">
      <figcaption className="lp-sheet-label">Fig. 1 — Exploded assembly <span>Example build</span></figcaption>
      <div className="lp-drawing">
        <img src="/landing/exploded-robot.svg" alt="" />
        {CALLOUTS.map(c => <div key={c.n} className={`lp-callout ${c.side}`} style={{ left: `${c.x}%`, top: `${c.y}%` }}>
          <span className="lp-callout-n">{c.n}</span><strong>{c.title}</strong><span className="lp-callout-sub">{c.sub}</span><span className="lp-callout-short"><b>{c.n}</b> {c.short}</span>
        </div>)}
        <span className="lp-dim" style={{ left: "34.2%", top: "81.8%", transform: "rotate(30deg)" }}>220 mm</span>
        <span className="lp-dim" style={{ left: "80.2%", top: "78.9%", transform: "rotate(-30deg)" }}>170 mm</span>
      </div>
      <div className="lp-titleblock">
        <div><span>Assembly</span><b><i className="lp-tb-prefix">mecanum_arm · </i>key-fetcher</b></div>
        <div><span>Task</span><b className="mono">fetch_under_obstacle</b></div>
        <div className="pass"><span>Sim gate</span><b className="mono">PASS · att. 3</b></div>
      </div>
    </figure>
  </section>;
}

function Thesis() {
  const stats = [["Ship untested", "0", "Every design clears a MuJoCo sim gate before you see it."], ["Attempts, max", "3", "A critic routes each failure to the one agent that can fix it."], ["Test tasks", "4", "Drive a loop, fetch under a couch, climb a ramp, pick and place."]];
  return <section className="lp-thesis">
    <div className="lp-thesis-copy"><Eyebrow n="01">Thesis</Eyebrow><h2 className="lp-h2">Robotics isn’t bottlenecked by model scale. It’s bottlenecked by <em>evaluation.</em></h2></div>
    <div className="lp-stats">{stats.map(([label, value, note]) => <div key={label} className="lp-stat"><p className="lp-label">{label}</p><div><b>{value}</b><p>{note}</p></div></div>)}</div>
  </section>;
}

function Explainer() {
  return <section className="lp-explainer" id="explainer">
    <div className="lp-section-head">
      <div><Eyebrow n="02">In thirty seconds</Eyebrow><h2 className="lp-h1">Watch a text become <em>a robot.</em></h2></div>
      <p>From a message on your phone to a parts list, a chassis, a circuit board and code, tested in physics before it reaches you.</p>
    </div>
    <figure className="lp-video">
      <div className="lp-video-bar"><span>Fig. 2 — RoboForge explainer</span><span>0:30</span></div>
      <video controls playsInline preload="metadata" poster="/roboforge-explainer-poster.jpg">
        <source src="/roboforge-explainer.mp4" type="video/mp4" />
        <a href="/roboforge-explainer.mp4">Download the explainer video</a>
      </video>
    </figure>
  </section>;
}

function Loop() {
  return <section className="lp-loop" id="loop">
    <div className="lp-section-head">
      <div><Eyebrow n="03">The loop</Eyebrow><h2 className="lp-giant">Fail. Fix.<br /><em>Pass.</em></h2></div>
      <p>Every design runs headless in MuJoCo against the task you described. When it fails, a critic reads the sim report and sends one precise fix to the one agent responsible. You watch it get better.</p>
    </div>
    <ol className="lp-attempts">
      {ATTEMPTS.map(a => <li key={a.n} className={`lp-attempt ${a.pass ? "pass" : ""}`}>
        <header><span>Attempt {a.n}</span><span className="lp-chip"><i />{a.pass ? "Pass" : "Fail"}</span></header>
        <img src={`/landing/${a.img}.svg`} alt={a.verdict} />
        <div className="lp-report">
          <h3>{a.verdict}</h3>
          <dl>{a.rows.map(([k, v, hot]) => <div key={k}><dt>{k}</dt><dd className={hot ? "hot" : ""}>{v}</dd></div>)}</dl>
          <div className="lp-critic"><span>{a.route}</span><p>{a.fix}</p></div>
        </div>
      </li>)}
    </ol>
  </section>;
}

function Agents() {
  return <section className="lp-agents">
    <div className="lp-section-head">
      <div><Eyebrow n="04">The forge</Eyebrow><h2 className="lp-h1">Six agents.<br />One <em>bill of materials.</em></h2></div>
      <p>Body, Board and Brain build in parallel. Everything lands in one MJCF with real masses and motor limits, then faces the gate.</p>
    </div>
    <table className="lp-table">
      <thead><tr><th>No.</th><th>Agent</th><th>Does</th><th>Emits</th><th>Runs on</th></tr></thead>
      <tbody>{AGENTS.map(([name, does, emits, runs], i) => <tr key={name}>
        <td className="mono accent">A-0{i + 1}</td><td className={`lp-agent-name ${name === "Critic" ? "critic" : ""}`}>{name}</td><td>{does}</td><td className="mono">{emits}</td><td className="muted">{runs}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

function BuildPack() {
  return <section className="lp-pack lp-grid">
    <div className="lp-phone" aria-label="Example iMessage thread">
      <div className="lp-phone-screen">
        <div className="lp-phone-head"><Logo /><span>RoboForge</span></div>
        <div className="lp-thread">
          <span className="lp-time">Today 9:41 PM</span>
          <p className="me">a robot that fetches my keys from under the couch</p>
          <p>On it. Mecanum base + arm, testing against your couch (80 mm clearance).</p>
          <p>Attempt 1 hit the couch. Lowering the deck…</p>
          <div className="lp-gif"><img src="/landing/sim3.svg" alt="Passing simulation" /><div><b>Passed on attempt 3 · 41.8 s</b><span>Build pack ready</span></div></div>
          <p className="me">wait it actually works??</p>
        </div>
      </div>
    </div>
    <div className="lp-pack-copy">
      <Eyebrow n="05">The build pack</Eyebrow>
      <h2 className="lp-h1">Everything you need<br />to <em>actually build it.</em></h2>
      <p className="lp-body">Not a render. A parts list you can order tonight, a chassis you can print tomorrow, and a board you can send to fab.</p>
      <ul className="lp-files">
        {FILES.map(([name, note], i) => <li key={name}><span className="mono accent">0{i + 1}</span><b className="mono">{name}</b><span className="lp-file-note">{note}</span><Download /></li>)}
        <li className="lp-files-cta"><div><span className="lp-label">Every passing run</span><b>One download.</b></div><Link href="/dashboard">See real build packs <Arrow /></Link></li>
      </ul>
    </div>
  </section>;
}

function GalleryPreview({ robots }: { robots: GalleryItem[] }) {
  // Real runs first; examples of other robot types fill the row until there are three.
  const real = robots.slice(0, 3);
  const items = [...real, ...EXAMPLES.filter(e => !real.some(r => r.category === e.category))].slice(0, 3);
  return <section className="lp-gallery">
    <div className="lp-section-head">
      <div><Eyebrow n="06">Dashboard</Eyebrow><h2 className="lp-h1">Real robots, ready<br />to <em>poke at.</em></h2></div>
      <Link className="lp-outline" href="/dashboard">Open the dashboard <Arrow /></Link>
    </div>
    <div className="lp-cards">{items.map((item, i) => {
      const example = item.id.startsWith("example-");
      const href = example ? `/build?prompt=${encodeURIComponent(item.title)}` : `/run/${encodeURIComponent(item.id)}`;
      return <Link key={item.id} href={href} className="lp-card">
        <div className="lp-card-thumb lp-grid-fine">
          {example ? <img src={item.thumbnail_url ?? ""} alt="" /> : item.thumbnail_url ? <StillThumbnail url={item.thumbnail_url} title={item.title} /> : <img src={EXAMPLES[i % 3].thumbnail_url ?? ""} alt="" />}
          {item.passed && <span className="lp-pass-chip"><i />Passed sim</span>}
        </div>
        <div className="lp-card-copy">
          <p className="lp-label">{item.maker} · {item.category}</p>
          <div><h3>{item.title}</h3><span className="mono">{item.bom_usd != null ? `$${Math.round(item.bom_usd)}` : example ? "Try it ↗" : ""}</span></div>
        </div>
      </Link>;
    })}</div>
  </section>;
}

function Cta() {
  return <section className="lp-cta">
    <Eyebrow n="07">Your turn{PHONE ? " · iMessage" : ""}</Eyebrow>
    {PHONE ? <>
      <p className="lp-cta-lead">Describe a robot. Text it to</p>
      <a className="lp-cta-number" href={smsHref}>{PHONE.replace(/^\+1\s*/, "")}</a>
    </> : <>
      <p className="lp-cta-lead">Describe a robot.</p>
      <Link className="lp-cta-number" href="/build">Forge it now.</Link>
    </>}
    <footer className="lp-footer">
      <div><span className="font-serif">RoboForge</span><span className="lp-label">Idea → physics → reality</span></div>
      <nav><Link href="/dashboard">Dashboard</Link><Link href="/build">Build</Link><Link href="/live">Live screen</Link><a href="#explainer">Explainer</a></nav>
      <span className="lp-label">Built at Founders Inc · 2026</span>
    </footer>
  </section>;
}

export default function Landing() {
  const { data } = useGallery();
  return <main className="lp">
    <header className="lp-nav">
      <Link href="/" className="lp-brand"><Logo /><span>RoboForge</span></Link>
      <nav><a href="#loop">How it works</a><a href="#explainer">Watch</a><Link href="/dashboard">Dashboard</Link><Link href="/live">Live</Link></nav>
      <div className="lp-nav-actions">{PHONE && <a className="mono" href={smsHref}>{PHONE}</a>}<Link className="lp-dark-pill" href="/build">Build a robot <Arrow /></Link></div>
    </header>
    <Hero robots={data?.counts.robots} />
    <Thesis />
    <Explainer />
    <Loop />
    <Agents />
    <BuildPack />
    <GalleryPreview robots={data?.robots ?? []} />
    <Cta />
  </main>;
}
