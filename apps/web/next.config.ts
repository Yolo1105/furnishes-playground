import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // React 19.3 + React Compiler (babel-plugin-react-compiler).
  reactCompiler: true,
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: ["@furnishes/domain", "@furnishes/scene"],
  // PGlite loads its own wasm from disk, so it is required at runtime
  // rather than bundled; the migrations ride along with every route
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // what every response says about itself: no type sniffing, a referrer
  // trimmed to the origin across sites, the microphone for Eva alone,
  // and HTTPS kept for two years once seen
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(self), geolocation=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ],
    },
  ],
  turbopack: {
    // The pnpm workspace root, so workspace packages resolve.
    root: path.resolve(here, "../.."),
  },
};

export default nextConfig;
