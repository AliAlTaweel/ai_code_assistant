import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Load .env explicitly (rather than relying on ambient process.env) and pass
// it through to test workers via `test.env`, since vitest runs test files in
// separate worker threads/processes that don't automatically inherit env
// mutations made while evaluating this config file.
const parsedEnv = loadEnv().parsed ?? {};

export default defineConfig({
  test: {
    env: parsedEnv,
    globalSetup: ["./db/test/global-setup.ts"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
