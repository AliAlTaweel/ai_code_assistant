import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// Merging vite.config.ts (rather than a bare defineConfig) means tests share the same
// @vitejs/plugin-react setup as dev/build, so JSX files don't need an explicit `import React`
// just to satisfy Vitest's transform.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
    },
  })
);
