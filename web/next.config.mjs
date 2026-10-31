// Backend paths proxied through the web app, so one public URL (e.g. a single
// tunnel to :3000) serves the pages, the API, artifacts and the Photon webhook.
const backend = (process.env.BACKEND_INTERNAL_URL || "http://localhost:8000").replace(/\/$/, "");
const proxied = ["/runs", "/runs/:path*", "/artifacts/:path*", "/assets/:path*", "/webhooks/:path*", "/health"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }] },
  async rewrites() {
    return proxied.map((source) => ({ source, destination: `${backend}${source}` }));
  },
};
export default nextConfig;
