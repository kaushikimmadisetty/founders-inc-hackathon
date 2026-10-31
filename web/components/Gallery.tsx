"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mediaUrl, useGallery, type GalleryItem } from "@/lib/gallery";

const examples = ["a robot that fetches my keys from under the couch", "a little rover that patrols my apartment", "a warehouse bot for tight aisles"];
export function ExploreHeader() {
  return <header className="explore-header"><span className="explore-brand"><Link href="/" className="explore-brand"><span className="logo-mark">R</span><strong className="font-serif">roboforge</strong></Link><span>/</span><Link href="/dashboard">Dashboard</Link></span><Link className="explore-pill" href="/build">Build a robot</Link></header>;
}
export function HelpButton() {
  const [open, setOpen] = useState(false);
  return <div className="explore-help">{open && <div id="loop-help" role="status"><strong>Fail → fix → pass</strong><p>Describe a robot. We source real parts and test it in physics. When a simulation fails, the critic identifies the problem and routes a fix back to the design agents. Inspect each attempt, then download the passing build pack.</p></div>}<button aria-label="How RoboForge works" aria-expanded={open} aria-controls="loop-help" onClick={() => setOpen(v => !v)}>?</button></div>;
}
/** Draw once into a canvas: animated simulation GIFs never play on Explore. */
export function StillThumbnail({ url, title }: { url: string; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setFailed(false);
    const img = new Image();
    img.onload = () => { if (!active || !canvas.current) return; const el = canvas.current; el.width = img.naturalWidth; el.height = img.naturalHeight; el.getContext("2d")?.drawImage(img, 0, 0); };
    img.onerror = () => { if (active) setFailed(true); };
    img.src = mediaUrl(url);
    return () => { active = false; img.onload = null; img.onerror = null; };
  }, [url]);
  return failed ? <RobotIllustration /> : <canvas ref={canvas} role="img" aria-label={title} />;
}
export function RobotIllustration() {
  return <svg viewBox="0 0 400 250" role="img" aria-label="Illustrative robot assembly"><ellipse cx="205" cy="192" rx="123" ry="21" fill="#e9edf1"/><g stroke="#344253" strokeWidth="2" strokeLinejoin="round"><path d="m88 124 131-49 105 51-131 53Z" fill="#89a3b9"/><path d="m88 124 105 55v21L88 145Z" fill="#5d758d"/><path d="m193 179 131-53v21l-131 53Z" fill="#71899c"/><g fill="#26313b"><ellipse cx="111" cy="160" rx="17" ry="28" transform="rotate(-25 111 160)"/><ellipse cx="195" cy="192" rx="17" ry="28" transform="rotate(-25 195 192)"/><ellipse cx="303" cy="148" rx="17" ry="27" transform="rotate(-25 303 148)"/></g><path d="m156 122 67-26 51 24-67 28Z" fill="#397958"/><path d="m189 118 28-11 22 11-28 11Z" fill="#26313b"/><path d="m235 107 0-44 12-5 0 47Z" fill="#a5b3be"/><path d="m218 60 26-10 23 12-26 10Z" fill="#364558"/></g></svg>;
}
export default function Gallery() {
  const { data, error } = useGallery();
  const [category, setCategory] = useState("All"); const [passed, setPassed] = useState(false);
  const [order, setOrder] = useState("Popular"); const [search, setSearch] = useState(false); const [query, setQuery] = useState("");
  const phone = process.env.NEXT_PUBLIC_PHOTON_NUMBER ?? "(number coming)";
  const robots = data?.robots ?? [];
  const fallback: GalleryItem[] = examples.map((title, i) => ({ id: `example-${i}`, type: "robot", title, category: ["mecanum arm", "2-wheel rover", "Warehouse"][i], maker: "RoboForge", license: "Example concept" }));
  const items = [...(data && !robots.length ? fallback : robots), ...(data?.assets ?? [])];
  const categories = { ...data?.categories };
  if (data && !robots.length) fallback.forEach(item => { categories[item.category] = (categories[item.category] ?? 0) + 1; });
  const visible = items.filter(item => (category === "All" || item.category === category) && (!passed || item.passed) && `${item.title} ${item.maker} ${item.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => order === "Recent" ? (b.created_ms ?? 0) - (a.created_ms ?? 0) : (b.popularity ?? b.stars ?? Number(b.passed)) - (a.popularity ?? a.stars ?? Number(a.passed)));
  return <main className="explore-page"><ExploreHeader /><div className="explore-content">
    <section className="explore-hero"><h1>Real robots, ready to <em>poke at</em>.</h1><p>Robots designed from real parts, tested in physics, rendered in 3D. Open one, tap any part and see what it does.</p><div className="explore-cta"><Link href="/build" className="explore-primary"><span>＋</span> Build a robot</Link><span><b>{data?.counts.robots ?? 0}</b> robots · <b>{data?.counts.assets ?? 0}</b> assets from <b>{data?.counts.makers ?? 0}</b> makers</span></div></section>
    <nav className="category-chips" aria-label="Categories">{[["All", items.length], ...Object.entries(categories)].map(([name, count]) => <button key={name} aria-pressed={category === name} onClick={() => setCategory(String(name))} className={category === name ? "active" : ""}>{name} <span>{count}</span></button>)}</nav>
    <p className="gallery-count"><b>{visible.length}</b> items · {category === "All" ? "all categories" : category}</p>
    <div className="gallery-filters"><button className="search-round" aria-label="Search gallery" aria-expanded={search} onClick={() => setSearch(v => !v)}>⌕</button>{search && <input autoFocus aria-label="Search robots and assets" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />}<button className="passed-toggle" role="switch" aria-checked={passed} onClick={() => setPassed(v => !v)}><span className={passed ? "on" : ""}><i /></span>Passed sim only</button><div className="segment">{["Popular", "Recent"].map(value => <button key={value} className={order === value ? "active" : ""} aria-pressed={order === value} onClick={() => setOrder(value)}>{value}</button>)}</div></div>
    <div className="phone-banner">or text it to <a href={phone.startsWith("(") ? undefined : `sms:${phone}`}>{phone}</a></div>
    {error && <p role="status" className="gallery-message">Gallery connection unavailable. Retrying…</p>}{!data && !error && <p className="gallery-message">Loading robots and assets…</p>}
    <div className="gallery-grid">{visible.map(item => <Link key={`${item.type}-${item.id}`} className="gallery-card" href={item.id.startsWith("example-") ? `/build?prompt=${encodeURIComponent(item.title)}` : `/${item.type === "robot" ? "run" : "asset"}/${encodeURIComponent(item.id)}`}><div className="gallery-thumbnail">{item.thumbnail_url ? <StillThumbnail url={item.thumbnail_url} title={item.title} /> : <RobotIllustration />}<span className="card-arrow" aria-hidden="true">↗</span></div><div className="gallery-card-copy"><p>{item.maker} · {item.category} · {item.license ?? "License not supplied"}</p><div><h2>{item.title}</h2><span className="card-metric">{item.type === "asset" ? `${item.dims_m?.map(d => Math.round(d * 100)).join(" × ") ?? "—"} cm` : item.bom_usd != null ? `BOM $${Math.round(item.bom_usd)}` : item.passed ? "★ passed" : item.id.startsWith("example-") ? "Try it ↗" : "In progress"}</span></div></div></Link>)}</div>
    {data && !visible.length && <p className="gallery-message">No items match these filters.</p>}{data?.warming && <p className="gallery-message">More assets are being prepared. This gallery updates every 5 seconds.</p>}
  </div><HelpButton /></main>;
}
