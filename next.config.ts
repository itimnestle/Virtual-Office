import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Loaded from node_modules at runtime (pdfkit reads its own data files).
  serverExternalPackages: ["pdfkit", "exceljs"],
  // The Thai PDF font is read from disk, so make sure deployments include it.
  outputFileTracingIncludes: {
    "/api/export/[kind]": ["./node_modules/@expo-google-fonts/sarabun/400Regular/*.ttf", "./node_modules/@expo-google-fonts/sarabun/700Bold/*.ttf"],
  },
  // Behind a reverse proxy or tunnel the browser origin differs from the host Next sees.
  // Opt in per environment, e.g. SERVER_ACTIONS_ALLOWED_ORIGINS="demo.example.com"; unset = same origin only.
  ...(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS
    ? { experimental: { serverActions: { allowedOrigins: process.env.SERVER_ACTIONS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()) } } }
    : {}),
  // next dev blocks dev assets for unknown hostnames; list tunnel hosts, e.g. DEV_ALLOWED_ORIGINS="*.trycloudflare.com".
  ...(process.env.DEV_ALLOWED_ORIGINS
    ? { allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS.split(",").map((s) => s.trim()) }
    : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
