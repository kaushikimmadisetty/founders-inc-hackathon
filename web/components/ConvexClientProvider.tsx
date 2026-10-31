"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  const url = raw && !/^REPLACE/i.test(raw) ? raw : undefined; // REPLACE_ME placeholders count as unset
  const client = useMemo(() => (url ? new ConvexReactClient(url) : null), [url]);
  if (!client) return <>{children}</>; // Convex not configured: pages fall back to backend polling
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
