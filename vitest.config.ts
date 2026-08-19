import { config as loadEnv } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Load .env explicitly (rather than relying on ambient process.env) and pass
// it through to test workers via `test.env`, since vitest runs test files in
// separate worker threads/processes that don't automatically inherit env
// mutations made while evaluating this config file.
const parsedEnv = loadEnv().parsed ?? {};

export default defineConfig({
  // @vitejs/plugin-react only transforms .jsx/.tsx files, so this is inert outside apps/web —
  // it's needed here (not just in apps/web/vite.config.ts) because a root-level `npm test`
  // resolves THIS config, not apps/web's, for every file it collects (see
  // environmentMatchGlobs below for the same reasoning applied to jsdom).
  plugins: [react()],
  test: {
    env: parsedEnv,
    globalSetup: ["./db/test/global-setup.ts"],
    testTimeout: 15000,
    fileParallelism: false,
    // apps/web's own vitest.config.ts sets jsdom, but that config is only consulted when
    // Vitest is invoked from within apps/web (e.g. `npm test --workspace=apps/web`) — a
    // root-level `npm test` resolves this file instead, so apps/web's React component tests
    // need jsdom applied here too.
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    // Mirrors apps/web/vitest.config.ts's setupFiles: a root-level `npm test` resolves THIS
    // config (see comment above), so apps/web's jest-dom matchers (toBeInTheDocument, etc.)
    // need to be wired in here too, not just in apps/web's own config.
    setupFiles: ["./apps/web/test/setup.ts"],
  },
});
