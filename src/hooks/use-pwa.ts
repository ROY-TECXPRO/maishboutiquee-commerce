import { useState, useEffect, useCallback } from 'react';
import { BeforeInstallPromptEvent } from '@/types';

/**
 * Detect iOS, including iPadOS (which reports a desktop UA but is touch-first).
 *
 * iOS Safari has no `beforeinstallprompt` event at all - there is no API to
 * open the install sheet. The only supported route is
 * Share > Add to Home Screen, so the UI must teach the user instead of
 * calling an API.
 */
const detectIOS = (): boolean => {
  const ua = navigator.userAgent;
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
};

/** True when running as an installed app rather than a browser tab. */
const detectStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true;

export const usePWA = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(detectStandalone);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDesktop, setIsDesktop] = useState(
    !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ),
  );
  const [isIOS, setIsIOS] = useState(detectIOS);

  useEffect(() => {
    setIsInstalled(detectStandalone());
    setIsIOS(detectIOS());

    const handleBeforeInstallPrompt = (e: Event) => {
      // preventDefault() suppresses Chrome's mini-infobar so the app can drive
      // the prompt from its own button.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsInstallable(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Install error:', error);
      return false;
    }
  }, [deferredPrompt]);

  /**
   * Whether the install banner is worth showing.
   *
   * The old guard was `!isInstallable`, which permanently hid the banner on
   * iOS: no event ever arrives there, so the flag stayed false forever.
   * iOS users now get the manual Share > Add to Home Screen instructions.
   */
  const canPromptInstall = !isInstalled && (isInstallable || isIOS);

  return {
    isInstallable,
    isInstalled,
    isOnline,
    isDesktop,
    isIOS,
    canPromptInstall,
    installApp,
  };
};
