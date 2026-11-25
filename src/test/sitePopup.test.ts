import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  configToForm,
  discountPercent,
  emptyPopupForm,
  formToInput,
  isInternalPath,
  isoToLocalInput,
  isPopupLive,
  isValidImageRef,
  localInputToIso,
  mapPopupRow,
  mergeIncoming,
  parseSizes,
  popupToProduct,
  validatePopupForm,
  type PopupFormState,
  type SitePopupConfig,
  type SitePopupRow,
} from '@/lib/sitePopup';

function config(overrides: Partial<SitePopupConfig> = {}): SitePopupConfig {
  return {
    slug: 'seasonal',
    version: 3,
    isActive: true,
    badgeText: 'Badge',
    headline: 'Headline',
    subtitle: 'Message',
    highlightText: '',
    footerNote: '',
    imageUrl: '/images/image-pop.webp',
    productName: 'Shoe',
    price: 1500,
    originalPrice: 2500,
    sizes: ['40', '41'],
    ctaType: 'cart',
    ctaLabel: 'Buy',
    linkPath: '',
    delaySeconds: 5,
    startsAt: null,
    endsAt: null,
    updatedAt: '2026-11-22T10:00:00.000Z',
    ...overrides,
  };
}

function form(overrides: Partial<PopupFormState> = {}): PopupFormState {
  return {
    ...emptyPopupForm,
    isActive: true,
    headline: 'Black Friday',
    productName: 'Shoe',
    price: '1500',
    originalPrice: '2500',
    ...overrides,
  };
}

describe('parseSizes', () => {
  it('splits on commas and newlines, trims and removes duplicates', () => {
    expect(parseSizes(' 39, 40 ,40\n41,, ')).toEqual(['39', '40', '41']);
    expect(parseSizes('')).toEqual([]);
  });
});

describe('discountPercent', () => {
  it('works out the percentage off', () => {
    expect(discountPercent(1500, 2500)).toBe(40);
    expect(discountPercent(750, 1000)).toBe(25);
  });
  it('returns null when there is no real discount', () => {
    expect(discountPercent(1500, null)).toBeNull();
    expect(discountPercent(1500, 1500)).toBeNull();
    expect(discountPercent(2000, 1500)).toBeNull();
    expect(discountPercent(0, 0)).toBeNull();
  });
});

describe('isInternalPath / isValidImageRef', () => {
  it('accepts in-site paths only', () => {
    expect(isInternalPath('/sale')).toBe(true);
    expect(isInternalPath('/category/men-wear?x=1')).toBe(true);
    expect(isInternalPath('//evil.example')).toBe(false);
    expect(isInternalPath('/\\evil.example')).toBe(false);
    expect(isInternalPath('https://evil.example')).toBe(false);
    expect(isInternalPath('javascript:alert(1)')).toBe(false);
    expect(isInternalPath('sale')).toBe(false);
    expect(isInternalPath('/has space')).toBe(false);
  });
  it('accepts empty, in-site or https images; rejects the rest', () => {
    expect(isValidImageRef('')).toBe(true);
    expect(isValidImageRef('/images/x.webp')).toBe(true);
    expect(isValidImageRef('https://abc.supabase.co/storage/x.png')).toBe(true);
    expect(isValidImageRef('http://abc.example/x.png')).toBe(false);
    expect(isValidImageRef('javascript:alert(1)')).toBe(false);
    expect(isValidImageRef('data:image/png;base64,AAAA')).toBe(false);
  });
});

describe('isPopupLive', () => {
  const now = new Date('2026-12-01T12:00:00.000Z');
  it('is off when switched off', () => {
    expect(isPopupLive(config({ isActive: false }), now)).toBe(false);
  });
  it('is on with no schedule', () => {
    expect(isPopupLive(config(), now)).toBe(true);
  });
  it('respects start and end', () => {
    expect(isPopupLive(config({ startsAt: '2026-12-02T00:00:00.000Z' }), now)).toBe(false);
    expect(isPopupLive(config({ startsAt: '2026-11-30T00:00:00.000Z' }), now)).toBe(true);
    expect(isPopupLive(config({ endsAt: '2026-12-01T12:00:00.000Z' }), now)).toBe(false);
    expect(isPopupLive(config({ endsAt: '2026-12-31T00:00:00.000Z' }), now)).toBe(true);
  });
});

describe('popupToProduct', () => {
  it('builds a cart item whose id carries the version', () => {
    const product = popupToProduct(config({ version: 7 }));
    expect(product.id).toBe('seasonal-offer-v7');
    expect(product.price).toBe(1500);
    expect(product.originalPrice).toBe(2500);
    expect(product.sizes).toEqual(['40', '41']);
    expect(product.images[0].src).toBe('/images/image-pop.webp');
  });
  it('drops a "was" price that is not higher', () => {
    expect(popupToProduct(config({ originalPrice: 1000 })).originalPrice).toBeUndefined();
  });
  it('falls back to a placeholder image and the headline as name', () => {
    const product = popupToProduct(config({ imageUrl: '', productName: '' }));
    expect(product.images[0].src).toBe('/placeholder.svg');
    expect(product.name).toBe('Headline');
  });
});

describe('mapPopupRow', () => {
  it('maps snake_case rows and tolerates numeric strings and nulls', () => {
    const mapped = mapPopupRow({
      slug: 'seasonal',
      version: 4,
      is_active: true,
      badge_text: null,
      headline: 'H',
      subtitle: null,
      highlight_text: null,
      footer_note: null,
      image_url: null,
      product_name: null,
      price: '1500.00',
      original_price: '2500.00',
      sizes: null,
      cta_type: 'link',
      cta_label: null,
      link_path: '/sale',
      delay_seconds: 3,
      starts_at: null,
      ends_at: null,
      updated_at: null,
    } as SitePopupRow);
    expect(mapped.price).toBe(1500);
    expect(mapped.originalPrice).toBe(2500);
    expect(mapped.sizes).toEqual([]);
    expect(mapped.ctaType).toBe('link');
    expect(mapped.ctaLabel).toBe('Add to Cart & Checkout');
    expect(mapped.badgeText).toBe('');
  });
  it('treats an unknown cta_type as cart', () => {
    expect(mapPopupRow({ slug: 's', version: 1, cta_type: 'weird' } as SitePopupRow).ctaType).toBe('cart');
  });
});

describe('mergeIncoming', () => {
  it('keeps what we have when a read fails or returns nothing', () => {
    const current = config();
    expect(mergeIncoming(current, null)).toBe(current);
    expect(mergeIncoming(null, null)).toBeNull();
  });
  it('takes the newer save and ignores a slower, older one', () => {
    const older = config({ version: 2, updatedAt: '2026-11-22T09:00:00.000Z' });
    const newer = config({ version: 3, updatedAt: '2026-11-22T10:00:00.000Z' });
    expect(mergeIncoming(older, newer)).toBe(newer);
    expect(mergeIncoming(newer, older)).toBe(newer);
  });
  it('lets a deleted-and-recreated row (version reset) win by timestamp', () => {
    const before = config({ version: 9, updatedAt: '2026-11-22T09:00:00.000Z' });
    const recreated = config({ version: 1, updatedAt: '2026-11-22T11:00:00.000Z' });
    expect(mergeIncoming(before, recreated)).toBe(recreated);
  });
});

describe('date conversion', () => {
  it('round-trips a datetime-local value', () => {
    const iso = localInputToIso('2026-12-24T08:30');
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso)).toBe('2026-12-24T08:30');
  });
  it('handles empty and invalid values', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('not a date')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('garbage')).toBe('');
  });
});

describe('validatePopupForm', () => {
  it('accepts a complete cart offer', () => {
    expect(validatePopupForm(form())).toEqual([]);
  });

  it('lets an unfinished draft be saved while switched off', () => {
    expect(validatePopupForm({ ...emptyPopupForm })).toEqual([]);
  });

  it('requires headline, product and price when switched on', () => {
    const errors = validatePopupForm(form({ headline: '', productName: '', price: '' }));
    expect(errors.join(' ')).toMatch(/headline/i);
    expect(errors.join(' ')).toMatch(/product name/i);
    expect(errors.join(' ')).toMatch(/price/i);
  });

  it('rejects a "was" price that is not higher than the offer price', () => {
    expect(validatePopupForm(form({ originalPrice: '1000' })).join(' ')).toMatch(/higher/i);
  });

  it('rejects an unusable delay', () => {
    expect(validatePopupForm(form({ delaySeconds: '-1' })).join(' ')).toMatch(/delay/i);
    expect(validatePopupForm(form({ delaySeconds: '121' })).join(' ')).toMatch(/delay/i);
    expect(validatePopupForm(form({ delaySeconds: '2.5' })).join(' ')).toMatch(/delay/i);
    expect(validatePopupForm(form({ delaySeconds: 'abc' })).join(' ')).toMatch(/delay/i);
    expect(validatePopupForm(form({ delaySeconds: '0' }))).toEqual([]);
  });

  it('requires an in-site link for a link button', () => {
    const base = { ctaType: 'link' as const, productName: '', price: '', originalPrice: '' };
    expect(validatePopupForm(form({ ...base, linkPath: '' })).join(' ')).toMatch(/page/i);
    expect(validatePopupForm(form({ ...base, linkPath: 'https://evil.example' })).join(' ')).toMatch(/this site/i);
    expect(validatePopupForm(form({ ...base, linkPath: '//evil.example' })).join(' ')).toMatch(/this site/i);
    expect(validatePopupForm(form({ ...base, linkPath: '/sale' }))).toEqual([]);
  });

  it('rejects an unsafe image reference', () => {
    expect(validatePopupForm(form({ imageUrl: 'javascript:alert(1)' })).join(' ')).toMatch(/image/i);
    expect(validatePopupForm(form({ imageUrl: 'http://insecure.example/a.png' })).join(' ')).toMatch(/image/i);
  });

  it('rejects an end date that is not after the start date', () => {
    const errors = validatePopupForm(form({ startsAt: '2026-12-25T10:00', endsAt: '2026-12-24T10:00' }));
    expect(errors.join(' ')).toMatch(/after the start/i);
  });

  it('enforces length limits', () => {
    expect(validatePopupForm(form({ headline: 'x'.repeat(121) })).join(' ')).toMatch(/headline is too long/i);
    expect(validatePopupForm(form({ subtitle: 'x'.repeat(301) })).join(' ')).toMatch(/message is too long/i);
  });
});

describe('formToInput / configToForm', () => {
  it('converts the form into database input', () => {
    const input = formToInput(
      form({ sizes: '39, 40', price: '1,500', originalPrice: '2500', delaySeconds: '8', badgeText: '  Hi  ' })
    );
    expect(input.price).toBe(1500);
    expect(input.originalPrice).toBe(2500);
    expect(input.sizes).toEqual(['39', '40']);
    expect(input.delaySeconds).toBe(8);
    expect(input.badgeText).toBe('Hi');
    expect(input.startsAt).toBeNull();
  });

  it('clears the link when the button adds to cart, and the "was" price when it is not higher', () => {
    const input = formToInput(form({ linkPath: '/sale', originalPrice: '1000' }));
    expect(input.linkPath).toBe('');
    expect(input.originalPrice).toBeNull();
  });

  it('round-trips a saved config', () => {
    const original = config({ startsAt: '2026-12-24T05:30:00.000Z', endsAt: '2026-12-31T20:00:00.000Z' });
    const roundTripped = formToInput(configToForm(original));
    expect(roundTripped.headline).toBe(original.headline);
    expect(roundTripped.price).toBe(original.price);
    expect(roundTripped.originalPrice).toBe(original.originalPrice);
    expect(roundTripped.sizes).toEqual(original.sizes);
    expect(roundTripped.startsAt).toBe(original.startsAt);
    expect(roundTripped.endsAt).toBe(original.endsAt);
  });

  it('turns a missing row into an empty, switched-off form', () => {
    const empty = configToForm(null);
    expect(empty.isActive).toBe(false);
    expect(empty.headline).toBe('');
  });
});
