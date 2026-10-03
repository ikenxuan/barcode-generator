import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // CI 冷环境的 jsdom 初始化 + 字体度量可能超过默认 5s
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
