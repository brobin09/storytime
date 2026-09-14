import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/storytime/",
  server: {
    port: 5766,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["kokoro-js", "@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Storytime",
        short_name: "Storytime",
        start_url: "./index.html",
        display: "standalone",
        background_color: "#f6f3ee",
        theme_color: "#5b7fff",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith("huggingface.co") ||
              url.hostname.endsWith("hf.co"),
            handler: "CacheFirst",
            options: {
              cacheName: "kokoro-tts-model",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
