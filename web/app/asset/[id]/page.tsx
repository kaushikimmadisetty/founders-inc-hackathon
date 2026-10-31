"use client";
import { use } from "react";
import dynamic from "next/dynamic";
const AssetWorkspace = dynamic(() => import("@/components/AssetWorkspace"), { ssr: false });
export default function AssetPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <AssetWorkspace id={id} />; }
