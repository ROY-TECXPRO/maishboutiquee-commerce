import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
  const location = useLocation();
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, Sparkles, Star, X } from 'lucide-react';
import { formatPrice } from '@/data/products';
import { useCart } from '@/context/CartContext';
import { customerServiceOffer } from '@/lib/offer-product';
import { cn } from '@/lib/utils';
import type { Size } from '@/types';

/**
 * Customer Service Week flash offer popup.
 * Shows the offer image (Nike Air Force 1 — was KSh 2,500, now KSh 1,500)
 * 5 seconds after the visitor arrives. Can be cancelled at any time via
 * the X button, No thanks, Escape, or clicking the backdrop, and will not
 * pop up again in the same session.
 */
const SIZES = ['39', '40', '41', '42', '43', '44', '45', '46'];

export function CustomerWeekOffer(): React.JSX.Element {
  const navigate = useNavigate();
  const { addItem, isInCart } = useCart();

  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [hoveredSize, setHoveredSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Triggered 5 seconds after arrival; remembered per session.
  useEffect(() => {
  // Not shown on the checkout/cart pages so the purchase flow is uninterrupted.
  if (location.pathname === '/checkout' || location.pathname === '/cart') return;
    if (sessionStorage.getItem('csw-week-popup-dismissed')) return;
    const isCrawler = /googlebot|bingbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|pinterest|applebot/i.test(
      navigator.userAgent ?? '',
    );
    if (isCrawler) return;
    const timer = window.setTimeout(() => setOpen(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) sessionStorage.setItem('csw-week-popup-dismissed', 'true');
  }, [open]);

  const handleClose = (): void => setOpen(false);

  const handleClaim = (): void => {
    if (!selectedSize) {
      setError('Please select a size to claim this offer.');
      return;
    }
    setError(null);
    if (isInCart(customerServiceOffer.id, selectedSize as Size, 'Black')) {
      navigate('/checkout');
      return;
    }
    addItem(customerServiceOffer, selectedSize as Size, customerServiceOffer.colors[0], 1);
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className='fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            role='dialog'
            aria-modal='true'
            aria-label='Customer Service Week offer'
          >
            <motion.div
              className='w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8'
              initial={{ scale: 0.96, y: 14, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 14, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* --- Greeting header --- */}
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <p className='inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-800'>
                    <Sparkles className='h-3.5 w-3.5' />
                    Customer Service Week
                  </p>
                  <h2 className='mt-4 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl'>
                    Happy Customer Service Week dear customer!
                  </h2>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Shop with us on the website and claim <span className='font-bold text-foreground'>30% offers</span>.
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className='rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                  aria-label='Cancel / close offer'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>

              {/* --- Offer image --- */}
              <div className='relative mt-6 overflow-hidden rounded-2xl bg-muted/40'>
                <img
                  src='/images/image-pop.webp'
                  alt='Nike Air Force 1 on Customer Service Week offer'
                  className='h-[240px] w-full object-contain sm:h-[320px]'
                  loading='eager'
                />
              </div>

              {/* --- Offer body --- */}
              <div className='mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-baseline gap-3'>
                  <span className='text-3xl font-extrabold tracking-tight text-foreground'>
                    {formatPrice(1500)}
                  </span>
                  <span className='text-sm text-muted-foreground'>
                    Was {formatPrice(2500)}
                  </span>
                  <span className='inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700'>
                    40% off
                  </span>
                </div>
                <span className='inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700'>
                  <Star className='h-3.5 w-3.5 fill-amber-400 text-amber-400' />
                  Rated 5/5
                </span>
              </div>

              {/* --- Size picker --- */}
              <div className='mt-5'>
                <label className='text-sm font-bold text-foreground'>Size</label>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {SIZES.map((size) => (
                    <button
                      key={size}
                      type='button'
                      onClick={() => setSelectedSize(size)}
                      onMouseEnter={() => setHoveredSize(size)}
                      onMouseLeave={() => setHoveredSize(null)}
                      className='inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-bold transition'
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {error && (
                  <p className='mt-2 text-sm text-red-600' role='alert'>
                    {error}
                  </p>
                )}
                <p className='mt-1 text-xs text-muted-foreground'>
                  {selectedSize
                    ? `Offer added to cart as size ${selectedSize}.`
                    : 'Choose a size to claim the offer.'}
                </p>
              </div>

              {/* --- Action buttons --- */}
              <div className='mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-2'>
                <button
                  onClick={handleClose}
                  className='inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted/50'
                >
                  <X className='mr-2 h-4 w-4' /> No thanks
                </button>
                <button
                  onClick={handleClaim}
                  disabled={!selectedSize}
                  className='inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-40'
                >
                  <ShoppingBag className='h-4 w-4' />
                  Add to Cart & Checkout
                </button>
              </div>

              <p className='mt-3 text-center text-xs text-muted-foreground'>
                Limited stock — 50 pairs left. Offer ends soon!
              </p>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default CustomerWeekOffer;
