import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const { API_PROXY_TARGET } = loadEnv(mode, ".", "API_PROXY_TARGET");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      strictPort: true,
      proxy: {
        "/api": API_PROXY_TARGET || "http://127.0.0.1:3001",
      },
    },
  };
});
