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
  // never inside another site's frame (a sign-in or a payment button
  // under someone else's page), and HTTPS kept for two years once seen;
  // the room's own files (skies, surfaces, props, the catalogue's
  // pictures, the decoders) are kept a day by the browser and the CDN
  // and served stale for a week while they refresh, as they are named
  // for what they are, not for a build
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
    {
      source: "/:dir(sky|materials|props|catalogue|draco|oidn|swaps)/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800",
        },
      ],
    },
  ],
  // the studio is the site's one page: the old addresses lead there,
  // a shared room's, an order's and a reset mail's with what they
  // carried (the query rides along: a reset's ?token=, an order's ?key=),
  // and the readings to the studio's ?read= of each
  redirects: async () => [
    { source: "/", destination: "/rounded", permanent: false },
    { source: "/s/:id", destination: "/rounded?share=:id", permanent: false },
    {
      source: "/orders/:id",
      destination: "/rounded?order=:id",
      permanent: false,
    },
    ...["help", "terms", "privacy"].map((r) => ({
      source: `/${r}`,
      destination: `/rounded?read=${r}`,
      permanent: false,
    })),
    ...["/studio", "/account", "/ops", "/reset"].map((source) => ({
      source,
      destination: "/rounded",
      permanent: false,
    })),
  ],
  turbopack: {
    // The pnpm workspace root, so workspace packages resolve.
    root: path.resolve(here, "../.."),
  },
};

export default nextConfig;
