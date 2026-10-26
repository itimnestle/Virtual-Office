import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Server modules are tested directly under Node; the RSC guard does not apply.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // PGlite's WASM compile OOMs inside forked workers on Windows; threads work.
    pool: "threads",
    // PGlite instances are heavy; run DB files one at a time.
    fileParallelism: false,
  },
});
