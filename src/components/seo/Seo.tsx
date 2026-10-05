import { useEffect } from 'react';
import { applySeo, type SeoConfig } from '@/lib/seo';

/**
 * Renders nothing and writes SEO metadata into <head> for the lifetime of the
 * page. Deliberately dependency-free (no react-helmet) to keep the JS bundle
 * small — this app already ships a large catalog.
 */
export function Seo(props: SeoConfig) {
  const {
    title,
    description,
    canonicalPath,
    image,
    type,
    noindex,
    jsonLd,
  } = props;

  // Serialised so a freshly-built object literal doesn't re-run the effect on
  // every render, while still reacting when the data actually changes.
  const jsonLdKey = jsonLd === undefined ? 'undefined' : JSON.stringify(jsonLd);

  useEffect(() => {
    applySeo({
      title,
      description,
      canonicalPath,
      image,
      type,
      noindex,
      jsonLd: jsonLdKey === 'undefined' ? undefined : JSON.parse(jsonLdKey),
    });
  }, [title, description, canonicalPath, image, type, noindex, jsonLdKey]);

  return null;
}

export default Seo;
