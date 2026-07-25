import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // state-nodes.json is read at runtime through fs, not imported, so the bundle
  // tracer can't see it — without this the route 500s on serverless hosting.
  outputFileTracingIncludes: {
    "/api/classify-state": ["./data/state-nodes.json"]
  }
};

export default nextConfig;
