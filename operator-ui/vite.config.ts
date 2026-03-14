import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(rootDir, "..");

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4322,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4320",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@aies-root": projectRoot,
    },
  },
});
