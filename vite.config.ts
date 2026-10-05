import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
//
// DEPLOYMENT TARGET: shared hosting (cPanel / HostPinnacle) -> upload dist/* to public_html
//
// `base` controls how the built HTML *references* its own assets. It has
// nothing to do with which web server hosts the files, so cPanel/Apache
// supports either value. What decides it is WHERE the site is mounted:
//
//   base: '/'   -> assets are referenced as /assets/...  (site at domain root)
//   base: './'  -> assets are referenced as ./assets/... (site in a SUBFOLDER)
//
// For a React Router SPA, '/' is the only safe value at the domain root.
// With './' the browser resolves ./assets/index-*.js against the *current*
// URL, so opening /product/women-dress-001 requests
// /product/assets/index-*.js, which the SPA rewrite turns into index.html.
// The browser then rejects the module (text/html is not valid JavaScript)
// and the page renders blank. Verified: that is exactly what broke this site.
//
// Subfolder deployments (e.g. example.com/shop/) can still opt in:
//   VITE_BASE_PATH=./ npm run build
export const BASE_PATH = process.env.VITE_BASE_PATH?.trim() || '/';

export default defineConfig(({ mode }) => ({
  base: BASE_PATH,
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [
        "favicon.ico",
        "icons/*.png",
        "images/icons/*.svg",
        "App-icon.webp",
      ],
      manifest: {
        name: "Maish Fashion Boutique",
        short_name: "Maish Fashion",
        description: "Kenya's Premier Fashion Destination - Shop Women, Men & Kids Wear",
        theme_color: "#d84a1b",
        background_color: "#faf9f7",
        display: "standalone",
        orientation: "portrait",
        scope: './',
        start_url: './',
        categories: ["shopping", "fashion", "lifestyle"],
        // Real, genuinely square PNGs. The previous entries declared
        // "192x192"/"512x512" but pointed at 594x420 and 3508x2480 landscape
        // files, so the browser stretched them and Chrome refused to fire
        // `beforeinstallprompt` - which is why no install banner ever appeared.
        // Regenerate with: npm run generate:icons
        icons: [
          {
            src: './icons/icon-192.png',
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: './icons/icon-512.png',
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: './icons/icon-192-maskable.png',
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: './icons/icon-512-maskable.png',
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // CRITICAL: only the APP SHELL is precached - never the product images.
        //
        // Previously this glob matched every .webp/.jpg/.png under public/images,
        // so 593 of 617 precache entries were product photos. Workbox serves those
        // CacheFirst from the precache and never asks the network again, so an
        // image the admin deleted in the dashboard stayed on screen until the
        // user cleared site data - the "deleted on the dashboard but still on the
        // site" symptom.
        //
        // Images are now fetched at runtime via the NetworkFirst rule below, so a
        // save/delete in the dashboard is reflected on the very next load.
        globPatterns: ["**/*.{js,css,html,ico,woff,woff2}"],
        globIgnores: ["**/images/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB

        // --- Guaranteed fresh updates for installed users -------------------
        // A service worker only re-checks sw.js on navigation, and it honours
        // the HTTP cache unless told otherwise. These settings make "refresh
        // and get the new version" reliable:
        //
        //   navigateFallback (below) - navigations resolve to the precached
        //     index.html, which is refreshed in lockstep with the new worker
        //     because skipWaiting + clientsClaim take effect immediately, so
        //     a refresh lands on the new app shell rather than a stale one.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/rest\//],

        runtimeCaching: [
          // PRODUCT IMAGES - the fix for "deleted in admin, still on the site".
          //
          // NetworkFirst (not CacheFirst) means every image request goes to the
          // network first; the cache is only a fallback when offline. So the
          // moment an admin saves or deletes an image, the next page load shows
          // the new state. Matches both locally hosted /images/* and images
          // served from the Supabase storage bucket.
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' ||
              /\.(?:webp|jpe?g|png|gif|avif|svg)$/i.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "product-images",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // Supabase API: network-first with an offline fallback. Caching this
          // CacheFirst would serve a stale product list or, worse, replay a
          // cached response after an order changes, so the data must be fresh.
          // Stale entries are only used when the network is unavailable.
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/(rest|storage)\//i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "unsplash-images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["framer-motion", "lucide-react"],
        },
      },
    },
  },
}));
