import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      AI_PROVIDER: "fixture",
      AUTH_MODE: "development",
      AUTH_DEVELOPMENT_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
      NODE_ENV: "test",
      HOST: "127.0.0.1"
    },
    environment: "node",
    hookTimeout: 30_000,
    testTimeout: 30_000
  }
});
