import React from 'react';

/**
 * Small banner offering to load a freshly deployed version.
 *
 * Why this exists: `skipWaiting` activates the new worker and it precaches the
 * new index.html, but the *currently open document* keeps running its old
 * JavaScript until it is actually reloaded. Without this prompt a shopper can
 * sit on a stale build until they happen to hit refresh.
 */
export const UpdatePrompt: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);

  React.useEffect(() => {
    const isDesktopBrowser = !/Android|webOS|iPhone|iPad|iPod/i.test(
      navigator.userAgent,
    );
    setIsDesktop(isDesktopBrowser);

    // The worker fires this once a new build has been precached and activated.
    const onUpdated = () => setVisible(true);
    window.addEventListener('sw:updated', onUpdated);

    return () => window.removeEventListener('sw:updated', onUpdated);
  }, []);

  if (!visible) return null;

  const apply = () => {
    setVisible(false);
    reloadToUpdate();
  };

  if (!isDesktop) {
    return (
      <div className="fixed bottom-20 left-0 right-0 z-50 px-4 md:bottom-6">
        <div className="max-w-md mx-auto flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-sm flex-1">A new version is available</p>
          <button
            onClick={apply}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
          >
            Update
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <p className="text-sm">A new version is available</p>
        <button
          onClick={apply}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
        >
          Update now
        </button>
      </div>
    </div>
  );
};

/**
 * Service-worker registration, owned explicitly here instead of by
 * vite-plugin-pwa's injected script (`injectRegister: null` in vite.config.ts).
 *
 * The critical setting is `updateViaCache: 'none'`. A browser will otherwise
 * serve sw.js from its own HTTP cache, so an installed app can stay pinned to
 * an old build even after you deploy. Bypassing that cache makes every page
 * load ask the network whether the worker changed.
 *
 * `skipWaiting` and `clientsClaim` are compiled into the generated worker (see
 * the `workbox` block in vite.config.ts), so a new version activates
 * immediately and takes over open tabs. Together with the precached
 * index.html, a refresh always lands on the current build.
 */
export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  // Dev builds are served by Vite's HMR; a worker would fight it.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        // Never answer sw.js from the HTTP cache. This is what guarantees a
        // refresh picks up a freshly deployed build.
        updateViaCache: 'none',
      })
      .then((registration) => {
        const checkForUpdate = () =>
          registration.update().catch(() => {
            /* offline: keep serving the cached worker */
          });

        // Re-check whenever the tab returns to the foreground. Mobile browsers
        // keep a tab alive for days, and someone returning to the app should
        // not be stuck on last week's build.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });

        // And periodically while the app stays open.
        window.setInterval(checkForUpdate, 60 * 60 * 1000);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'activated') {
              window.dispatchEvent(new CustomEvent('sw:updated'));
            }
          });
        });
      })
      .catch((error) => {
        // A failed registration must never break the site: it works fine
        // without a service worker, just without offline support.
        console.warn('Service worker registration failed:', error);
      });
  });
};

/**
 * Force the page onto the newest build.
 *
 * Needed because `skipWaiting` swaps the worker underneath a running document:
 * the page keeps executing its old JavaScript until it actually reloads. Used
 * by the update prompt so an update can be applied without hunting for a
 * reload button.
 */
export const reloadToUpdate = () => {
  window.location.reload();
};