import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

function resolvePort(value, fallback) {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

const host = process.env.FRONTEND_HOST || "0.0.0.0";
const devPort = resolvePort(process.env.FRONTEND_PORT, 5173);
const previewPort = resolvePort(process.env.FRONTEND_PREVIEW_PORT, 4173);

export default defineConfig({
  plugins: [vue()],
  server: {
    host,
    port: devPort,
    strictPort: true,
  },
  preview: {
    host,
    port: previewPort,
    strictPort: true,
  },
});
