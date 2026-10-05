import { useLocation } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import { useCatalog, findById, selectByCategory } from '@/lib/catalog';
import {
  categorySlugFromPath,
  fallbackSeoConfig,
  isCategoryRoute,
  isNoIndexRoute,
  isProductRoute,
  productIdFromPath,
  PUBLIC_ROUTES,
} from '@/lib/routeSeo';
import { metaDescription } from '@/lib/seo';
import {
  breadcrumbSchema,
  collectionPageSchema,
  localBusinessSchema,
  organizationSchema,
  productSchema,
  webPageSchema,
  webSiteSchema,
} from '@/lib/schema';

/**
 * Applies the correct <title>, meta description, canonical, robots directive,
 * Open Graph / Twitter tags and JSON-LD for whichever route is currently
 * rendered.
 *
 * Mounted once, next to <Routes>, so it can never be forgotten on a new page
 * and can never leave a route inheriting another route's metadata. Product
 * and category routes get their schema built from the real catalogue data.
 */
export function RouteSeo() {
  const { pathname } = useLocation();
  const { products, categories } = useCatalog();

  /* ---------------- Product detail ---------------- */
  if (isProductRoute(pathname)) {
    const productId = productIdFromPath(pathname);
    const product = productId ? findById(products, productId) : undefined;

    // A product slug that no longer exists must not be indexed as a thin page.
    if (!product) {
      return (
        <Seo
          title="Product Not Found"
          description="This product is no longer available. Browse the current Maish Fashion Boutique catalogue instead."
          canonicalPath={pathname}
          noindex
        />
      );
    }

    const category = categories.find((c) => c.id === product.category);
    const price = product.originalPrice
      ? ` Was ${product.originalPrice.toLocaleString('en-KE')} KES.`
      : '';
    const description = metaDescription(
      `${product.name}.${price} ${product.description || ''}`.trim() ||
        `${product.name} available from Maish Fashion Boutique.`
    );

    return (
      <Seo
        title={product.name}
        description={description}
        canonicalPath={`/product/${product.id}`}
        image={product.images[0]?.src}
        type="product"
        jsonLd={[
          productSchema(product, category),
          // Mirrors the visible breadcrumb rendered by ProductDetailPage
          // (Home / Category / Product) exactly, as Google requires.
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            {
              name: category?.name || 'Products',
              path: `/category/${product.category}`,
            },
            { name: product.name, path: `/product/${product.id}` },
          ]),
        ]}
      />
    );
  }

  /* ---------------- Category listing ---------------- */
  if (isCategoryRoute(pathname)) {
    const slug = categorySlugFromPath(pathname);
    const category = categories.find((c) => c.id === slug);
    const items = slug ? selectByCategory(products, slug as never) : [];

    if (!category) {
      return (
        <Seo
          title="Category Not Found"
          description="This collection is no longer available. Browse all Maish Fashion Boutique categories."
          canonicalPath={pathname}
          noindex
        />
      );
    }

    return (
      <Seo
        title={`${category.name} in Kenya`}
        description={metaDescription(
          `${category.description}. Shop ${items.length} ${category.name.toLowerCase()} products at Maish Fashion Boutique with countrywide delivery across Kenya.`
        )}
        canonicalPath={`/category/${category.id}`}
        image={category.image}
        jsonLd={[
          collectionPageSchema(category, items),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Categories', path: '/categories' },
            { name: category.name, path: `/category/${category.id}` },
          ]),
        ]}
      />
    );
  }

  /* ---------------- Private / admin / cart / account ---------------- */
  if (isNoIndexRoute(pathname)) {
    return <Seo {...fallbackSeoConfig(pathname)} noindex />;
  }

  /* ---------------- Static public pages ---------------- */
  const entry = PUBLIC_ROUTES[pathname] || fallbackSeoConfig(pathname);
  const isHome = pathname === '/';

  return (
    <Seo
      title={entry.title}
      description={entry.description}
      canonicalPath={pathname}
      image={entry.image}
      // Critical: without this, an unknown URL (soft 404) would inherit the
      // global "index, follow" from index.html and get indexed as a thin page.
      noindex={entry.noindex}
      // The homepage carries the site-level identity schema; other pages get a
      // plain WebPage node plus the organisation reference.
      jsonLd={
        isHome
          ? [
              organizationSchema(),
              localBusinessSchema(),
              webSiteSchema(),
              webPageSchema(entry.title, '/'),
            ]
          : [webPageSchema(entry.title, pathname)]
      }
    />
  );
}

export default RouteSeo;
