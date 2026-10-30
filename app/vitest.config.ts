import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { legalConfig, legalPages } from "./build/legal.ts";

export default defineConfig({
  plugins: [legalPages({ dir: "../docs/legal", config: legalConfig(loadEnv("test", process.cwd())) })],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
