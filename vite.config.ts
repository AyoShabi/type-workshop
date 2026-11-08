import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works at any path, including GitHub Pages project sites.
  base: "./",
  build: {
    outDir: "dist",
    // The app is small; keep one readable bundle.
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
