import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import type { Product, ProductColor, Size } from '@/types';
import { formatPrice, calculateDiscount } from '@/data/products';
import { useCart } from '@/context/CartContext';
import { Button } from '@/components/ui/button';

/**
 * Fallbacks for a product the admin created without sizes or colours —
 * the same defaults ProductDetailPage uses, so the item is immediately
 * purchasable from the offer row too.
 */
const DEFAULT_SIZES: Size[] = ['One Size'];
const DEFAULT_COLORS: ProductColor[] = [
  { name: 'As supplied', hex: '#9ca3af', available: true },
];

interface OfferProductCardProps {
  product: Product;
}

/**
 * Card used in the priority Offers row on the homepage (directly under the
 * Campaign Collections boxes).
 *
 * Clicking the image or the Buy Now button adds the item to the cart with
 * its default size/colour and takes the shopper straight to /checkout — the
 * offer row exists to give a one-tap path to buying a promoted product.
 */
export const OfferProductCard: React.FC<OfferProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const { addItem } = useCart();

  const size = (product.sizes?.length ? product.sizes[0] : DEFAULT_SIZES[0]) as Size;
  const color =
    product.colors?.find((c) => c.available) ?? product.colors?.[0] ?? DEFAULT_COLORS[0];
  const price = product.sizePrices?.[size] ?? product.price;
  const discount = product.originalPrice ? calculateDiscount(product.originalPrice, price) : 0;
  const primaryImage = product.images?.[0] ?? { src: '/placeholder.svg', alt: product.name };

  const handleBuyNow = () => {
    addItem({ ...product, price }, size, color, 1);
    navigate('/checkout');
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-shadow duration-300 hover:shadow-card-hover"
    >
      <button
        type="button"
        onClick={handleBuyNow}
        aria-label={`Buy ${product.name} now`}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
      >
        <img
          src={primaryImage.src}
          alt={primaryImage.alt}
          loading="lazy"
          width={300}
          height={400}
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
          Offer
        </span>
        {discount > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
            -{discount}%
          </span>
        )}
      </button>

      <div className="p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{product.name}</h3>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <span className="text-base font-bold text-primary">{formatPrice(price)}</span>
          {product.originalPrice != null && product.originalPrice > price && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>
        <Button size="sm" className="mt-2 w-full rounded-full" onClick={handleBuyNow}>
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          Buy Now
        </Button>
      </div>
    </motion.article>
  );
};

export default OfferProductCard;