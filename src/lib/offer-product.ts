/**
 * Customer Service Week single-offer product.
 *
 * The attached offer image (`public/images/image-pop.webp`) shows the
 * Nike Air Force shoe that is on offer this Customer Service Week.
 *
 * This lives here as an in-memory product definition because it is a
 * 24-hour flash offer that is NOT inserted into the `products` table.
 * It is consumed by the CustomerWeekOffer popup and the cart/checkout
 * flow (add to cart -> checkout).
 */
import type { Product } from '@/types';

export const customerServiceOffer: Product = {
  id: 'csw-nike-air-force-1-black',
  name: 'Nike Air Force 1 (Black)',
  price: 1500,
  originalPrice: 2500,
  images: [
    {
      src: '/images/image-pop.webp',
      alt: 'Nike Air Force 1 black shoe on Customer Service Week offer',
    },
  ],
  category: 'men-wear',
  gender: 'Men',
  sizes: ['39', '40', '41', '42', '43', '44', '45', '46'],
  colors: [{ name: 'Black', hex: '#000000', available: true }],
  tags: ['customer service week', 'air force', 'offer', 'flash sale', 'sale'],
  useCase: ['casual'],
  description:
    'Customer Service Week offer: Nike Air Force 1 in black, was KSh 2,500 now only KSh 1,500.',
  features: ['Customer Service Week exclusive', '40% off', '24-hour flash offer'],
  rating: 5,
  reviewCount: 0,
  isNew: false,
  isSale: true,
  stock: 50,
  sku: 'CSF-AF1-BLK',
  sizePrices: undefined,
};
