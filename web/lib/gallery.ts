"use client";
import { useEffect, useState } from "react";
import { BACKEND } from "./types";
export interface GalleryItem {
  type: "robot" | "asset"; id: string; title: string; category: string; maker: string;
  license?: string; thumbnail_url?: string | null; glb_url?: string; source_url?: string;
  dims_m?: [number, number, number]; passed?: boolean; bom_usd?: number | null; created_ms?: number;
  stars?: number; popularity?: number;
}
export interface Gallery { robots: GalleryItem[]; assets: GalleryItem[]; categories: Record<string, number>; counts: { robots: number; assets: number; makers: number }; warming: boolean }
export function mediaUrl(url: string) { return new URL(url, `${BACKEND}/`).href; }
export function useGallery() {
  const [data, setData] = useState<Gallery | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${BACKEND}/gallery`, { signal: controller.signal });
        if (!response.ok) throw new Error("Gallery unavailable");
        const feed: Gallery = await response.json();
        if (controller.signal.aborted) return;
        setData(feed); setError(false);
        if (feed.warming) timer = setTimeout(poll, 5000);
      } catch { if (!controller.signal.aborted) { setError(true); timer = setTimeout(poll, 5000); } }
    }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return { data, error };
}
