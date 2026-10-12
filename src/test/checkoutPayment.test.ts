import { describe, it, expect, vi } from 'vitest';

/**
 * Pins the checkout commercial terms:
 *  - delivery pricing (Nairobi and Other Counties are both KSh 300),
 *  - the M-Pesa till details shown in the confirmation popup, and
 *  - the phone number clients are told to send payment proof to.
 *
 * These are exported constants, so a typo here would silently break every
 * order confirmation — hence the regression test.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChanged: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DELIVERY_ZONES, MPESA_TILL_NUMBER, MPESA_TILL_NAME, PAYMENT_PROOF_PHONE } = await import(
  '@/pages/CheckoutPage'
);

describe('checkout delivery pricing', () => {
  it('charges KSh 300 for Nairobi and KSh 300 for other counties', () => {
    const nairobi = DELIVERY_ZONES.find((z) => z.id === 'nairobi');
    const other = DELIVERY_ZONES.find((z) => z.id === 'other');

    expect(nairobi?.price).toBe(300);
    expect(other?.price).toBe(300);
  });

  it('keeps Narok Town free delivery', () => {
    expect(DELIVERY_ZONES.find((z) => z.id === 'narok-town')?.price).toBe(0);
  });
});

describe('M-Pesa payment details', () => {
  it('uses the official till number and account name', () => {
    expect(MPESA_TILL_NUMBER).toBe('5044921');
    expect(MPESA_TILL_NAME).toBe('Maish Bazaar Ltd');
  });

  it('tells clients to send payment proof to 0799921036', () => {
    expect(PAYMENT_PROOF_PHONE).toBe('0799921036');
  });
});
