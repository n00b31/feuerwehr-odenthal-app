import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "true";
const nextConfig: NextConfig = {
  output: staticExport ? "export" : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: staticExport,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers: staticExport ? undefined : async () => {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }, {
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache" }],
    }];
  },
};

export default nextConfig;
