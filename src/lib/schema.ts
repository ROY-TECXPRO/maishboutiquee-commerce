/**
 * schema.org (JSON-LD) builders.
 *
 * Every value here comes from data that already exists in the app:
 * the real catalog (src/data/products.ts), the real contact block in the
 * footer and the real store coordinates in LocationPage. No review ratings,
 * review counts, prices, addresses or phone numbers are invented — the
 * Product builder deliberately omits aggregateRating because the seeded
 * numbers are demo data, and emitting them would violate Google's
 * "structured data must match visible content" policy.
 */
import { absoluteUrl, CURRENCY, SITE_NAME, SITE_URL } from '@/lib/seo';
import type { CategoryInfo, Product } from '@/types';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Real business details as published in the site footer / about page. */
export const businessDetails = {
  name: SITE_NAME,
  legalAlternateName: 'Maishboutique',
  foundingDate: '2009-05',
  telephone: ['+254799921036', '+254706397660'],
  email: 'maishboutiquemarketing@gmail.com',
  city: 'Narok',
  country: 'KE',
  geo: { latitude: -1.0912005, longitude: 35.871697 },
  sameAs: [
    'https://facebook.com/maishboutique',
    'https://instagram.com/maishboutique',
    'https://twitter.com/maishboutique',
    'https://youtube.com/@maishboutique',
    'https://www.tiktok.com/@maish_boutique1',
    'https://linkedin.com/company/maishboutique',
  ],
};

export function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: businessDetails.name,
    alternateName: businessDetails.legalAlternateName,
    url: `${SITE_URL}/`,
    foundingDate: businessDetails.foundingDate,
    email: businessDetails.email,
    telephone: businessDetails.telephone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: businessDetails.city,
      addressCountry: businessDetails.country,
    },
    contactPoint: businessDetails.telephone.map((telephone) => ({
      '@type': 'ContactPoint',
      telephone,
      contactType: 'customer service',
      areaServed: 'KE',
      availableLanguage: ['en', 'sw'],
    })),
    sameAs: businessDetails.sameAs,
  };
}

export function localBusinessSchema() {
  return {
    '@type': 'ClothingStore',
    '@id': `${SITE_URL}/#localbusiness`,
    name: businessDetails.name,
    url: `${SITE_URL}/`,
    image: absoluteUrl('/App-icon.webp'),
    logo: absoluteUrl('/Maish-logo-light-mode.webp'),
    email: businessDetails.email,
    telephone: businessDetails.telephone[0],
    foundingDate: businessDetails.foundingDate,
    address: {
      '@type': 'PostalAddress',
      addressLocality: businessDetails.city,
      addressCountry: businessDetails.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: businessDetails.geo.latitude,
      longitude: businessDetails.geo.longitude,
    },
    sameAs: businessDetails.sameAs,
    parentOrganization: { '@id': ORGANIZATION_ID },
  };
}

export function webSiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: 'en-KE',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/** Trims a long description to a sensible snippet length. */
function metaText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 300 ? `${clean.slice(0, 297)}…` : clean;
}

export interface Crumb {
  name: string;
  path: string;
}

/**
 * Product + Offer, following Google's product snippet requirements.
 * `availability` is derived from the real `stock` field, and the shipping
 * / return figures mirror the 1-5 day delivery and 7-day return policy
 * already stated on the About and Returns pages.
 */
export function productSchema(product: Product, category?: CategoryInfo) {
  const inStock = product.stock > 0;
  const description =
    product.description?.trim() ||
    `${product.name} available from ${SITE_NAME} in Kenya.`;

  return {
    '@type': 'Product',
    '@id': `${absoluteUrl(`/product/${product.id}`)}#product`,
    name: product.name,
    description: metaText(description),
    image: product.images.map((image) => absoluteUrl(image.src)),
    url: absoluteUrl(`/product/${product.id}`),
    sku: product.sku,
    mpn: product.sku,
    category: category ? `${category.name} — ${SITE_NAME}` : SITE_NAME,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      '@id': `${absoluteUrl(`/product/${product.id}`)}#offer`,
      url: absoluteUrl(`/product/${product.id}`),
      priceCurrency: CURRENCY,
      price: product.price.toFixed(2),
      itemCondition: 'https://schema.org/NewCondition',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@id': ORGANIZATION_ID },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: businessDetails.country,
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 2,
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 5,
            unitCode: 'DAY',
          },
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: businessDetails.country,
        returnPolicyCategory:
          'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
    },
  };
}

/** BreadcrumbList mirroring the visible breadcrumb trail exactly. */
export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function collectionPageSchema(
  category: CategoryInfo,
  products: Product[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl(`/category/${category.id}`)}#collection`,
    name: category.name,
    description: metaText(category.description),
    url: absoluteUrl(`/category/${category.id}`),
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.slice(0, 100).map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/product/${product.id}`),
        name: product.name,
      })),
    },
  };
}

export function webPageSchema(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    url: absoluteUrl(path),
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-KE',
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer.replace(/\s+/g, ' ').trim(),
      },
    })),
  };
}

