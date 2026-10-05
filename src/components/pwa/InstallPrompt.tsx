import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Monitor, Share, PlusSquare } from 'lucide-react';
import { usePWA } from '@/hooks/use-pwa';
import { Button } from '@/components/ui/button';

export const InstallPrompt: React.FC = () => {
  const { isInstalled, isIOS, isDesktop, isInstallable, canPromptInstall, installApp } =
    usePWA();
  const [dismissed, setDismissed] = React.useState(false);

  // Remember a dismissal so the banner does not nag on every page load.
  const DISMISS_KEY = 'maish-install-dismissed';

  React.useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === 'true') setDismissed(true);
  }, [DISMISS_KEY]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  /**
   * Never show: already installed, dismissed, or the browser cannot install and
   * is not iOS (e.g. Safari on macOS, or an already-engaged Chrome user).
   *
   * `canPromptInstall` covers the iOS case where no beforeinstallprompt event
   * ever fires but Share > Add to Home Screen still works.
   */
  if (isInstalled || dismissed || !canPromptInstall) return null;

  const handleInstall = async () => {
    const success = await installApp();
    if (success) dismiss();
  };

  // Desktop: top banner with a one-click install.
  if (isDesktop) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-primary text-primary-foreground py-3 px-4"
      >
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              Install Maish Fashion Boutique for the best experience
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleInstall}
              size="sm"
              variant="secondary"
              className="flex-shrink-0"
            >
              <Download className="w-4 h-4 mr-2" />
              Install
            </Button>
            <button
              onClick={dismiss}
              className="p-1 hover:bg-primary-foreground/20 rounded"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Mobile: bottom sheet. iOS cannot be prompted programmatically, so it gets
  // the manual Share > Add to Home Screen walkthrough instead of a dead button.
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4 md:pb-6"
      >
        <div className="max-w-md mx-auto bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-primary-foreground" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold">Install App</h3>

              {isIOS ? (
                <>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Add Maish Fashion to your Home Screen:
                  </p>
                  <ol className="text-sm text-muted-foreground mt-2 space-y-1.5">
                    <li className="flex items-center gap-2">
                      <Share className="w-4 h-4 flex-shrink-0" />
                      Tap the <span className="font-medium text-foreground">Share</span> button
                    </li>
                    <li className="flex items-center gap-2">
                      <PlusSquare className="w-4 h-4 flex-shrink-0" />
                      Choose{' '}
                      <span className="font-medium text-foreground">
                        Add to Home Screen
                      </span>
                    </li>
                  </ol>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={dismiss}
                  >
                    Got it
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    Install Maish Fashion for faster shopping and offline access
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={handleInstall}
                      size="sm"
                      className="flex-1"
                      disabled={!isInstallable}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Install
                    </Button>
                    <Button variant="ghost" size="sm" onClick={dismiss}>
                      Not Now
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
