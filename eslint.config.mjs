import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/next-env.d.ts",
  ]),
  // Next.js app: core-web-vitals + TypeScript presets, scoped to apps/web.
  ...nextVitals.map((c) => ({ ...c, files: ["apps/web/**/*.{ts,tsx,mjs}"] })),
  ...nextTs.map((c) => ({ ...c, files: ["apps/web/**/*.{ts,tsx,mjs}"] })),
  // Framework-free packages: plain TypeScript rules.
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["packages/**/*.ts"],
  })),
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
