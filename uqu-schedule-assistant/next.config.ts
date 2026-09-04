import type { NextConfig } from "next";

/**
 * The app is entirely client-side: it holds no server state, reads no request
 * context, and keeps every record in the visitor's own browser. That lets it
 * build as a static site, which is what the GitHub Pages workflow publishes.
 *
 * A project site is served from a subdirectory, so the workflow sets
 * NEXT_PUBLIC_BASE_PATH. It is empty in local development, where the app is
 * served from the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  // Static hosting serves a directory's index.html, so /editor/ resolves.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
