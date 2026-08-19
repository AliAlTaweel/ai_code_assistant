import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const parsedEnv = loadEnv().parsed ?? {};

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [],
    env: parsedEnv,
    testTimeout: 15000,
  },
});
