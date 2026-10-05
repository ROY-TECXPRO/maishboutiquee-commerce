/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxxxxxx.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase publishable / anon key (public — safe in the browser). */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Browser-restricted Google Maps JavaScript API key.
   * Never hardcode this — see src/pages/LocationPage.tsx.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /**
   * Canonical production origin used for <link rel="canonical">, og:url,
   * JSON-LD @ids, sitemap.xml and the robots.txt Sitemap directive.
   * Defaults to https://maishfashionboutique.co.ke.
   */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
