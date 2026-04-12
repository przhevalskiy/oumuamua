import type { NextConfig } from "next";

const agentexAPIBaseURL =
  process.env.NEXT_PUBLIC_AGENTEX_API_BASE_URL ?? "http://localhost:5003";

const acpBaseURL = "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy Agentex API calls (tasks, messages, agents) — avoids CORS
      {
        source: "/api/agentex/:path*",
        destination: `${agentexAPIBaseURL}/:path*`,
      },
      // Proxy screenshot endpoint served by the ACP server on port 8000
      {
        source: "/api/screenshot/:path*",
        destination: `${acpBaseURL}/screenshot/:path*`,
      },
    ];
  },
};

export default nextConfig;
