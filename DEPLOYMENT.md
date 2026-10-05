# Deploying to Shared Hosting (cPanel / HostPinnacle)

Static deployment only. No Node.js server, no Express, no platform config
required at runtime.

## 1. Build

```bash
npm ci
npm run build
```

`prebuild` regenerates `sitemap.xml` and `robots.txt` from the real catalogue
before Vite runs, so they are always in sync with the products you actually
sell.

Output: `dist/`

## 2. `base` path — read this before you change it

`base` controls how the built HTML *references* its own assets. It is
unrelated to which web server hosts the files — cPanel/Apache supports either
value. What decides it is **where the site is mounted**:

| Where the site lives | `base` | Command |
|---|---|---|
| `public_html` (domain root) — **the normal cPanel case** | `/` | `npm run build` |
| A subfolder, e.g. `example.com/shop/` | `./` | `VITE_BASE_PATH=./ npm run build` |

**Do not set `base: './'` when deploying to `public_html`.** This app uses
`BrowserRouter`, so the page URL can be `/product/women-dress-001`. With a
relative base the browser resolves `./assets/index-*.js` against *that* URL and
requests `/product/assets/index-*.js`, which does not exist. The SPA rewrite
returns `index.html`, the browser refuses to execute HTML as an ES module, and
the page renders blank.

Measured on a real build of this project:

| Build | Opening `/product/women-dress-001` | Opening `/` |
|---|---|---|
| `base: '/'` | 72,678 bytes, `<h1>Elegant Ankara Maxi Dress</h1>` | renders |
| `base: './'` | 4,129 bytes, **no `<h1>`, blank page** | renders (216,014 bytes) |

The homepage looks perfect either way, which is exactly why this ships broken —
only deep links, product pages and shared links are dead.

## 3. Upload

1. cPanel → **File Manager** → open `public_html`.
2. Delete any old `index.html` and `assets/` from a previous upload.
3. **Upload** the *contents* of `dist/` — select everything **inside** `dist/`
   (`index.html`, `assets/`, `images/`, `.htaccess`, `robots.txt`,
   `sitemap.xml`, the icons, `sw.js`, `manifest*.json`).
   Do **not** upload the `dist` folder itself. `public_html/index.html` must
   exist, not `public_html/dist/index.html`.
4. When extracting a ZIP instead, extract it directly into `public_html` so
   files land at the root, not in a nested folder.

### cPanel settings

- **Domains → Domains → Force HTTPS Redirect: ON** (also enforced in
  `.htaccess`).
- Confirm **"AllowOverride All"** is enabled, otherwise Apache ignores
  `.htaccess` and every deep link returns 404.
- cPanel → **Security Options** or the host's settings: ensure
  `public/.htaccess` is not being blocked by a host-level rule.

## 4. Verify after upload

```bash
curl -I  https://yourdomain.com/                     # 200
curl -I  https://yourdomain.com/sitemap.xml         # 200, application/xml
curl -I  https://yourdomain.com/robots.txt          # 200, text/plain
curl -I  https://yourdomain.com/assets/index-*.js   # 200, application/javascript
```

Then open a deep link directly in a private window —
`https://yourdomain.com/product/women-dress-001`. If you get a blank page, the
rewrite is not active (check `AllowOverride`) or `base` is set to `./`.

## 5. Environment variables

Only two, both public-safe. Set in Netlify/host build settings, or in a local
`.env` (never commit it):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

`VITE_SITE_URL` (canonical host) and `VITE_BASE_PATH` (see §2) are optional —
they have sane defaults. Do not put a Supabase **service role** key in here;
it would be shipped to the browser.

## 6. `netlify.toml`

Left in the repository only because Netlify still hosts the staging URL. It is
inert for cPanel and safe to delete once Netlify is retired.
