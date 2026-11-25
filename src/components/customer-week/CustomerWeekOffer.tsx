import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { safeInternalPath } from '@/lib/supabase';
import {
  popupToProduct,
  POPUP_COLOR_NAME,
  useSitePopup,
  type SitePopupConfig,
} from '@/lib/sitePopup';
import { SitePopupCard } from '@/components/customer-week/SitePopupCard';
import type { Size } from '@/types';

/**
 * Storefront popup, fully controlled from the admin dashboard (Popup tab).
 *
 * - Content comes from public.site_popups and stays in sync in realtime: when
 *   an admin saves, every open tab updates and the popup appears at once.
 * - Each save raises `version`. A visitor who closed an earlier version sees
 *   the new one; a visitor who closed THIS version does not see it again in
 *   the same browser session.
 * - Not shown on the cart / checkout pages, never to crawlers, and only
 *   inside the admin's optional start / end window.
 */
const DISMISS_KEY = 'site-popup-dismissed';

const CRAWLER_PATTERN =
  /googlebot|bingbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|pinterest|applebot/i;

function dismissToken(config: SitePopupConfig): string {
  return `${config.slug}:${config.version}`;
}

function isDismissed(config: SitePopupConfig): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === dismissToken(config);
  } catch {
    return false;
  }
}

function rememberDismissed(config: SitePopupConfig): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, dismissToken(config));
  } catch {
    // Storage blocked (private mode): the popup may reappear on the next page,
    // which is acceptable.
  }
}

export function CustomerWeekOffer(): React.JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { addItem, isInCart } = useCart();

  const isCrawler = useMemo(
    () => CRAWLER_PATTERN.test(typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''),
    []
  );
  const { config } = useSitePopup(!isCrawler);

  const mountedAt = useRef(Date.now());
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocked = pathname === '/checkout' || pathname === '/cart';

  // Show: after the admin's delay (counted from when the visitor arrived, so a
  // popup published while they are already browsing appears immediately), and
  // not before the admin's start time.
  useEffect(() => {
    if (!config || isCrawler || blocked || !config.isActive) return;
    if (isDismissed(config)) return;

    const now = Date.now();
    if (config.endsAt && now >= Date.parse(config.endsAt)) return;

    const untilDelay = config.delaySeconds * 1000 - (now - mountedAt.current);
    const untilStart = config.startsAt ? Date.parse(config.startsAt) - now : 0;
    const wait = Math.max(untilDelay, untilStart, 0);

    const timer = window.setTimeout(() => setOpen(true), wait);
    return () => window.clearTimeout(timer);
  }, [config, isCrawler, blocked]);

  // Hide: the admin switched it off / deleted it, or the visitor moved to a
  // page that must not be interrupted.
  useEffect(() => {
    if (open && (!config || !config.isActive || blocked)) setOpen(false);
  }, [open, config, blocked]);

  // A new version may no longer offer the size the visitor had picked.
  useEffect(() => {
    setSelectedSize((current) => (current && config?.sizes.includes(current) ? current : null));
    setError(null);
  }, [config?.version, config?.sizes]);

  const handleClose = (): void => {
    if (config) rememberDismissed(config);
    setOpen(false);
  };

  // Escape closes the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // handleClose only reads `config`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config]);

  const handleClaim = (): void => {
    if (!config) return;

    if (config.ctaType === 'link') {
      rememberDismissed(config);
      setOpen(false);
      navigate(safeInternalPath(config.linkPath, '/'));
      return;
    }

    const needsSize = config.sizes.length > 0;
    if (needsSize && !selectedSize) {
      setError('Please select a size to claim this offer.');
      return;
    }
    setError(null);

    const product = popupToProduct(config);
    const size = (needsSize ? selectedSize : 'One Size') as Size;

    rememberDismissed(config);
    setOpen(false);
    if (!isInCart(product.id, size, POPUP_COLOR_NAME)) {
      addItem(product, size, product.colors[0], 1);
    }
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      {open && config && (
        <motion.div
          key="site-popup"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label={config.headline || config.badgeText || 'Special offer'}
        >
          <motion.div
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl"
            initial={{ scale: 0.96, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 14, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <SitePopupCard
              config={config}
              selectedSize={selectedSize}
              error={error}
              onSelectSize={(size) => {
                setSelectedSize(size);
                setError(null);
              }}
              onClose={handleClose}
              onClaim={handleClaim}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CustomerWeekOffer;
