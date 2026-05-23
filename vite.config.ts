import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/cache": "http://localhost:3000",
      "/socket.io": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
});
