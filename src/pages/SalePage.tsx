import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { OfferProductCard } from '@/components/product/OfferProductCard';
import { useCatalog, selectOfferProducts } from '@/lib/catalog';
import { isCouponDay, nairobiDayName, useSiteSale } from '@/lib/siteSale';

/** Re-evaluates "is it a coupon day" every minute, so the page flips at midnight. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Older browsers / blocked clipboard: fall back to a hidden textarea.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * Sale page.
 *
 * Everything on it is controlled from the admin dashboard and updates in
 * realtime:
 *   - the Sale switch, title and message (Sale tab),
 *   - the products (every product with the Offer switch on, the same ones the
 *     homepage Offers row shows),
 *   - the coupon code, shown here and only here, Friday to Sunday.
 */
const SalePage: React.FC = () => {
  const navigate = useNavigate();
  const now = useMinuteClock();
  const { config, loaded } = useSiteSale();
  const { products } = useCatalog();
  const [copied, setCopied] = useState(false);

  // The homepage row shows the first 12; the Sale page shows every offer.
  const offers = useMemo(
    () => selectOfferProducts(products, Math.max(products.length, 1)),
    [products]
  );

  if (!loaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" aria-busy="true">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!config || !config.isActive) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-md mx-auto">
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              No sale at the moment
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              There is no sale running right now. New offers appear here as soon as they start.
            </p>
            <Button onClick={() => navigate('/')} size="lg">
              Back to homepage
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showCode = isCouponDay(now) && config.couponCode !== '';
  const showCodeSoon = !isCouponDay(now) && config.couponCode !== '';

  const handleCopy = async () => {
    await copyText(config.couponCode);
    setCopied(true);
    toast.success('Code copied');
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-transition min-h-screen">
      <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-500 text-white py-8 md:py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-3xl md:text-5xl font-bold">{config.title}</h1>
          {config.subtitle && (
            <p className="text-white/90 mt-3 max-w-xl mx-auto text-lg">{config.subtitle}</p>
          )}
        </div>
      </div>

      {showCode && (
        <div className="container mx-auto px-4 pt-6">
          <div className="max-w-xl mx-auto rounded-2xl border-2 border-dashed border-primary/40 bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Use this code at checkout for {config.discountPercent}% off
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span
                className="font-mono text-3xl font-bold tracking-widest text-primary"
                data-testid="coupon-code"
              >
                {config.couponCode}
              </span>
              <Button variant="outline" size="sm" onClick={handleCopy} aria-label="Copy coupon code">
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Valid Friday, Saturday and Sunday only.
            </p>
          </div>
        </div>
      )}

      {showCodeSoon && (
        <div className="container mx-auto px-4 pt-6">
          <div className="max-w-xl mx-auto rounded-2xl bg-muted p-5 text-center">
            <p className="font-semibold">Weekend coupon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The coupon code appears on this page every Friday, Saturday and Sunday.
              Today is {nairobiDayName(now)}.
            </p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        {offers.length > 0 ? (
          <>
            <div className="mb-4">
              <h2 className="font-display text-2xl font-bold">On offer now</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {offers.length} {offers.length === 1 ? 'item' : 'items'}. Tap any item to go
                straight to checkout.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {offers.map((product) => (
                <OfferProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <h2 className="font-display text-2xl font-bold">New offers are on the way</h2>
            <p className="mt-2 text-muted-foreground">
              Products on offer will appear here as soon as they are added. Check back soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalePage;
