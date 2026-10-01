import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// ── Code-split vendor: thư viện nặng tách riêng để chunk "vendor" không phình ──
// (xlsx/docx/mammoth/jszip chỉ dùng ở tính năng import/export — lazy)
const SPLIT_VENDOR_PKGS = ["xlsx", "docx", "mammoth", "jszip"];
function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
  if (id.includes("lucide-react")) return "vendor-lucide";
  if (id.includes("react")) return "vendor-react";
  for (const pkg of SPLIT_VENDOR_PKGS) {
    if (id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`)) {
      return `vendor-${pkg}`;
    }
  }
  return "vendor";
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "Hệ thống Học tập & Giảng dạy SGK thông minh",
        short_name: "SGK Thông Minh",
        description: "AI Primary School Portal - Thư viện SGK lớp 1-5, soạn giáo án, hoạt động, phiếu học tập - chạy offline local",
        theme_color: "#2563EB",
        background_color: "#f8fafc",
        display: "standalone",
        scope: "/",
        start_url: "/",
        lang: "vi",
        orientation: "any",
        categories: ["education"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,woff}"],
        // Đừng precache PDF sách (để trong /api/books - quá lớn)
        globIgnores: ["**/books/**"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/templates\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "khbd-templates-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // PDF/ảnh sách: file lớn (10-28MB) + server đã hỗ trợ HTTP Range.
            // KHÔNG cho qua Workbox cache: CacheFirst + rangeRequests từng gây
            // "no-response / ERR_FAILED" hàng loạt khi thư viện fetch nhiều bìa
            // cùng lúc (cache miss -> tải full file -> nghẽn -> abort).
            // Để NetworkOnly cho request Range đi thẳng tới server.
            urlPattern: /\/api\/books\/.*\.(pdf|epub|jpg|jpeg|png|gif|webp)(\?|$)/i,
            handler: "NetworkOnly",
          },
          {
            // API JSON (danh sách sách, content txt/md/html...) — NetworkFirst cache nhẹ
            urlPattern: /\/api\/books\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "books-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      // Ảnh giáo án trích từ web (folder lesson-images ngoài cùng, backend serve tĩnh)
      "/lesson-images": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },
  build: {
    // pdf.worker is ~1MB by design (pdfjs-dist) — raise limit to avoid noise;
    // app chunks are code-split via manualChunks below to stay <500kB
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("node_modules/pdfjs-dist/")
        ) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          return vendorChunk(id);
        },
      },
    },
    // Vite 8 uses Rolldown internally — mirror manualChunks for rolldownOptions
    rolldownOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("node_modules/pdfjs-dist/")
        ) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          return vendorChunk(id);
        },
      },
    },
  },
});
