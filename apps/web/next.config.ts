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
  // the account lives on the home page now; old links still arrive
  redirects: async () => [
    { source: "/account", destination: "/", permanent: false },
  ],
  turbopack: {
    // The pnpm workspace root, so workspace packages resolve.
    root: path.resolve(here, "../.."),
  },
};

export default nextConfig;
