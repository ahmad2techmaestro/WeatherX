import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-vendor")) return "charts";
          if (id.includes("node_modules/leaflet") || id.includes("node_modules/react-leaflet") || id.includes("node_modules/@react-leaflet")) return "map";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router") || id.includes("node_modules/scheduler")) return "react";

          return undefined;
        },
      },
    },
  },

  server: {
    port: 5173,

    proxy: {
      "/api": {
        target: process.env.API_PROXY || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
