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
  turbopack: {
    // The pnpm workspace root, so workspace packages resolve.
    root: path.resolve(here, "../.."),
  },
};

export default nextConfig;
