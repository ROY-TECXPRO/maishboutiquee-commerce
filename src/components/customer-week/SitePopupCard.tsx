import { ArrowRight, ShoppingBag, Sparkles, Star, X } from 'lucide-react';
import { formatPrice } from '@/data/products';
import { cn } from '@/lib/utils';
import { discountPercent, type SitePopupInput } from '@/lib/sitePopup';

export interface SitePopupCardProps {
  config: SitePopupInput;
  selectedSize: string | null;
  error: string | null;
  onSelectSize: (size: string) => void;
  onClose: () => void;
  onClaim: () => void;
}

/**
 * The popup's visual card. It holds no router, cart or network logic, so the
 * storefront (CustomerWeekOffer) and the admin live preview render exactly the
 * same thing from the same data.
 */
export function SitePopupCard({
  config,
  selectedSize,
  error,
  onSelectSize,
  onClose,
  onClaim,
}: SitePopupCardProps): React.JSX.Element {
  const isCart = config.ctaType === 'cart';
  const showSizes = isCart && config.sizes.length > 0;
  const showPrice = config.price > 0;
  const discount = discountPercent(config.price, config.originalPrice);

  return (
    <div className="w-full rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
      {/* --- Header --- */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {config.badgeText && (
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
              <Sparkles className="h-3.5 w-3.5" />
              {config.badgeText}
            </p>
          )}
          {config.headline && (
            <h2
              className={cn(
                'text-2xl font-extrabold leading-tight text-foreground sm:text-3xl',
                config.badgeText && 'mt-4'
              )}
            >
              {config.headline}
            </h2>
          )}
          {config.subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Cancel / close offer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* --- Image --- */}
      {config.imageUrl && (
        <div className="relative mt-6 overflow-hidden rounded-2xl bg-muted/40">
          <img
            src={config.imageUrl}
            alt={config.productName || config.headline || 'Special offer'}
            className="h-[240px] w-full object-contain sm:h-[320px]"
            loading="eager"
          />
        </div>
      )}

      {/* --- Product / price --- */}
      {(config.productName || showPrice || config.highlightText) && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {config.productName && (
              <p className="text-sm font-semibold text-foreground">{config.productName}</p>
            )}
            {showPrice && (
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-extrabold tracking-tight text-foreground">
                  {formatPrice(config.price)}
                </span>
                {discount !== null && config.originalPrice !== null && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      Was {formatPrice(config.originalPrice)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                      {discount}% off
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          {config.highlightText && (
            <span className="inline-flex items-center gap-1 self-start rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 sm:self-auto">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {config.highlightText}
            </span>
          )}
        </div>
      )}

      {/* --- Size picker --- */}
      {showSizes && (
        <div className="mt-5">
          <p className="text-sm font-bold text-foreground">Size</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose a size">
            {config.sizes.map((size) => {
              const selected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSelectSize(size)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-bold transition',
                    selected
                      ? 'border-amber-500 bg-amber-500 text-white shadow'
                      : 'border-border bg-white text-foreground hover:border-amber-400 hover:bg-amber-50'
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedSize ? `Size ${selectedSize} selected.` : 'Choose a size to claim the offer.'}
          </p>
        </div>
      )}

      {/* --- Actions --- */}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted/50"
        >
          <X className="mr-2 h-4 w-4" /> No thanks
        </button>
        <button
          type="button"
          onClick={onClaim}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-4 focus:ring-amber-200"
        >
          {isCart ? <ShoppingBag className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {config.ctaLabel || (isCart ? 'Add to Cart & Checkout' : 'View offer')}
        </button>
      </div>

      {config.footerNote && (
        <p className="mt-3 text-center text-xs text-muted-foreground">{config.footerNote}</p>
      )}
    </div>
  );
}

export default SitePopupCard;
