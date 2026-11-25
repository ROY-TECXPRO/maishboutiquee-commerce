import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  configToSaleForm,
  couponMessage,
  emptySaleForm,
  formToSaleInput,
  isCouponDay,
  mapSaleRow,
  mergeSale,
  nairobiDayName,
  nairobiDayOfWeek,
  normalizeCouponCode,
  parseCouponResponse,
  recheckAppliedCoupon,
  validateSaleCoupon,
  validateSaleForm,
  type SaleFormState,
  type SiteSaleConfig,
  type SiteSaleRow,
} from '@/lib/siteSale';

function config(overrides: Partial<SiteSaleConfig> = {}): SiteSaleConfig {
  return {
    slug: 'weekend',
    version: 2,
    isActive: true,
    title: 'Weekend Sale',
    subtitle: 'Offers',
    couponCode: 'WEEKEND15',
    discountPercent: 15,
    updatedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

function form(overrides: Partial<SaleFormState> = {}): SaleFormState {
  return { ...emptySaleForm, isActive: true, title: 'Weekend Sale', couponCode: 'WEEKEND15', ...overrides };
}

describe('Nairobi weekend (Friday, Saturday, Sunday)', () => {
  // Nairobi is UTC+3 all year, so Nairobi midnight is 21:00 UTC the day before.
  it('flips to Friday at Nairobi midnight, not UTC midnight', () => {
    expect(isCouponDay(new Date('2026-11-26T20:59:59Z'))).toBe(false); // Thu 23:59:59
    expect(isCouponDay(new Date('2026-11-26T21:00:00Z'))).toBe(true); // Fri 00:00:00
  });
  it('ends after Sunday night Nairobi time', () => {
    expect(isCouponDay(new Date('2026-11-29T20:59:59Z'))).toBe(true); // Sun 23:59:59
    expect(isCouponDay(new Date('2026-11-29T21:00:00Z'))).toBe(false); // Mon 00:00:00
  });
  it('covers Friday, Saturday and Sunday and no weekday', () => {
    const noon = (iso: string) => isCouponDay(new Date(`${iso}T09:00:00Z`));
    expect(noon('2026-11-23')).toBe(false); // Mon
    expect(noon('2026-11-24')).toBe(false); // Tue
    expect(noon('2026-11-25')).toBe(false); // Wed
    expect(noon('2026-11-26')).toBe(false); // Thu
    expect(noon('2026-11-27')).toBe(true); // Fri
    expect(noon('2026-11-28')).toBe(true); // Sat
    expect(noon('2026-11-29')).toBe(true); // Sun
  });
  it('names the day in Nairobi', () => {
    expect(nairobiDayName(new Date('2026-11-24T10:00:00Z'))).toBe('Tuesday');
    expect(nairobiDayOfWeek(new Date('2026-11-29T10:00:00Z'))).toBe(0);
  });
});

describe('normalizeCouponCode', () => {
  it('upper-cases and removes spaces', () => {
    expect(normalizeCouponCode(' week end 15 ')).toBe('WEEKEND15');
  });
});

describe('mapSaleRow', () => {
  it('maps a row and tolerates nulls', () => {
    const mapped = mapSaleRow({
      slug: 'weekend', version: 3, is_active: true, title: null, subtitle: null,
      coupon_code: 'abc123', discount_percent: 20, updated_at: null,
    } as SiteSaleRow);
    expect(mapped.couponCode).toBe('ABC123');
    expect(mapped.discountPercent).toBe(20);
    expect(mapped.title).toBe('');
    expect(mapped.isActive).toBe(true);
  });
  it('defaults the percentage when missing', () => {
    expect(mapSaleRow({ slug: 's', version: 1 } as SiteSaleRow).discountPercent).toBe(15);
  });
});

describe('mergeSale', () => {
  it('never wipes known settings with a failed read', () => {
    const current = config();
    expect(mergeSale(current, null)).toBe(current);
  });
  it('keeps the fresher of two versions', () => {
    const older = config({ version: 1, updatedAt: '2026-11-24T09:00:00.000Z' });
    const newer = config({ version: 2, updatedAt: '2026-11-24T10:00:00.000Z' });
    expect(mergeSale(older, newer)).toBe(newer);
    expect(mergeSale(newer, older)).toBe(newer);
  });
});

describe('validateSaleForm', () => {
  it('accepts a complete form', () => {
    expect(validateSaleForm(form())).toEqual([]);
  });
  it('allows a draft with no code while switched off', () => {
    expect(validateSaleForm({ ...emptySaleForm })).toEqual([]);
  });
  it('allows a sale with no coupon at all', () => {
    expect(validateSaleForm(form({ couponCode: '' }))).toEqual([]);
  });
  it('rejects codes that are too short, too long or contain symbols', () => {
    for (const bad of ['AB', 'A'.repeat(21), 'SAVE-15', 'SAVE_15', 'ZAWADI!']) {
      expect(validateSaleForm(form({ couponCode: bad })).join(' ')).toMatch(/coupon code/i);
    }
  });
  it('accepts lower-case input with spaces (it is normalised on save)', () => {
    expect(validateSaleForm(form({ couponCode: 'week end 15' }))).toEqual([]);
  });
  it('rejects an unusable percentage', () => {
    for (const bad of ['', '0', '91', '-5', '12.5', 'abc']) {
      expect(validateSaleForm(form({ discountPercent: bad })).join(' ')).toMatch(/discount/i);
    }
    expect(validateSaleForm(form({ discountPercent: '1' }))).toEqual([]);
    expect(validateSaleForm(form({ discountPercent: '90' }))).toEqual([]);
  });
  it('requires a title when switched on, and limits lengths', () => {
    expect(validateSaleForm(form({ title: '' })).join(' ')).toMatch(/title/i);
    expect(validateSaleForm(form({ title: 'x'.repeat(81) })).join(' ')).toMatch(/title is too long/i);
    expect(validateSaleForm(form({ subtitle: 'x'.repeat(301) })).join(' ')).toMatch(/message is too long/i);
  });
});

describe('formToSaleInput / configToSaleForm', () => {
  it('normalises the code and converts the percentage', () => {
    const input = formToSaleInput(form({ couponCode: ' week end 15 ', discountPercent: '25', title: '  Sale  ' }));
    expect(input.couponCode).toBe('WEEKEND15');
    expect(input.discountPercent).toBe(25);
    expect(input.title).toBe('Sale');
  });
  it('round-trips a saved config', () => {
    const original = config();
    const back = formToSaleInput(configToSaleForm(original));
    expect(back.couponCode).toBe(original.couponCode);
    expect(back.discountPercent).toBe(original.discountPercent);
    expect(back.isActive).toBe(true);
  });
  it('gives a switched-off blank form when nothing is saved', () => {
    expect(configToSaleForm(null).isActive).toBe(false);
  });
});

describe('parseCouponResponse / couponMessage', () => {
  it('accepts a valid answer', () => {
    expect(parseCouponResponse({ valid: true, percent: 15 })).toEqual({ valid: true, percent: 15, reason: 'ok' });
  });
  it('maps the three failures', () => {
    for (const reason of ['inactive', 'invalid', 'not_weekend'] as const) {
      expect(parseCouponResponse({ valid: false, reason })).toEqual({ valid: false, percent: 0, reason });
    }
  });
  it('treats anything unexpected as an error, never as valid', () => {
    for (const bad of [null, undefined, 'yes', 5, {}, { valid: true }, { valid: true, percent: 0 }, { valid: true, percent: 99 }, { valid: 'true', percent: 15 }, { valid: false, reason: 'surprise' }]) {
      const result = parseCouponResponse(bad);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('error');
    }
  });
  it('words each failure for shoppers', () => {
    expect(couponMessage('not_weekend')).toMatch(/Friday, Saturday and Sunday/);
    expect(couponMessage('invalid')).toMatch(/not valid/);
    expect(couponMessage('inactive')).toMatch(/no promotion/i);
    expect(couponMessage('error')).toMatch(/try again/i);
  });
});

describe('validateSaleCoupon (server call)', () => {
  // Braces matter: a beforeEach that RETURNS the mock would be run as a cleanup function.
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends the typed code to the server function and returns the percentage', async () => {
    rpc.mockResolvedValue({ data: { valid: true, percent: 20 }, error: null });
    const result = await validateSaleCoupon('weekend15');
    expect(rpc).toHaveBeenCalledWith('validate_sale_coupon', { p_code: 'weekend15' });
    expect(result).toEqual({ valid: true, percent: 20, reason: 'ok' });
  });
  it('reports a server failure as an error, not as invalid', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    expect((await validateSaleCoupon('X'))).toEqual({ valid: false, percent: 0, reason: 'error' });
  });
  it('survives a network exception (rejected request)', async () => {
    rpc.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect((await validateSaleCoupon('X')).reason).toBe('error');
  });
  it('survives a client that throws immediately', async () => {
    rpc.mockImplementation(() => {
      throw new Error('client not ready');
    });
    expect((await validateSaleCoupon('X')).reason).toBe('error');
  });
});

describe('recheckAppliedCoupon (before an order is saved)', () => {
  const ok = { valid: true, percent: 15, reason: 'ok' as const };
  it('lets the order through when nothing changed', () => {
    expect(recheckAppliedCoupon(ok, 15).outcome).toBe('ok');
  });
  it('blocks and removes the discount when the code stopped working', () => {
    for (const reason of ['not_weekend', 'invalid', 'inactive'] as const) {
      const result = recheckAppliedCoupon({ valid: false, percent: 0, reason }, 15);
      expect(result.outcome).toBe('removed');
      expect(result.percent).toBe(0);
      expect(result.message).toMatch(/no longer valid/i);
    }
  });
  it('blocks, but keeps the code, when the server cannot be reached', () => {
    const result = recheckAppliedCoupon({ valid: false, percent: 0, reason: 'error' }, 15);
    expect(result.outcome).toBe('unverified');
    expect(result.percent).toBe(15);
  });
  it('blocks and shows the new percentage when the admin changed it', () => {
    const result = recheckAppliedCoupon({ valid: true, percent: 25, reason: 'ok' }, 15);
    expect(result.outcome).toBe('changed');
    expect(result.percent).toBe(25);
    expect(result.message).toMatch(/25%/);
  });
});
