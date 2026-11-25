import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  products: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: api.toastSuccess, error: api.toastError } }));
vi.mock('@/lib/adminActivity', () => ({ logAdminActivity: api.log }));
vi.mock('@/lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/catalog')>('@/lib/catalog');
  return { ...actual, useCatalog: () => ({ products: api.products }) };
});
vi.mock('@/lib/siteSale', async () => {
  const actual = await vi.importActual<typeof import('@/lib/siteSale')>('@/lib/siteSale');
  return { ...actual, fetchSiteSaleStrict: api.fetch, saveSiteSale: api.save };
});

import { AdminSaleSection } from '@/components/admin/AdminSaleSection';
import type { SiteSaleConfig } from '@/lib/siteSale';

function saved(overrides: Partial<SiteSaleConfig> = {}): SiteSaleConfig {
  return {
    slug: 'weekend', version: 4, isActive: true,
    title: 'Weekend Sale', subtitle: 'Offers all weekend.',
    couponCode: 'WEEKEND15', discountPercent: 15,
    updatedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

describe('AdminSaleSection', () => {
  beforeEach(() => {
    api.fetch.mockReset().mockResolvedValue(saved());
    api.save.mockReset();
    api.log.mockReset();
    api.toastError.mockReset();
    api.toastSuccess.mockReset();
    api.products = [
      { id: 'a', isOffer: true }, { id: 'b', isOffer: true }, { id: 'c', isOffer: false },
    ];
  });
  afterEach(cleanup);

  it('loads the saved settings and shows the sale as On', async () => {
    render(<AdminSaleSection />);
    expect(await screen.findByLabelText('Title')).toHaveValue('Weekend Sale');
    expect(screen.getByLabelText('Coupon code')).toHaveValue('WEEKEND15');
    expect(screen.getByLabelText('Discount (%)')).toHaveValue('15');
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText(/Saved version 4/)).toBeInTheDocument();
  });

  it('tells the admin how many products are on offer', async () => {
    render(<AdminSaleSection />);
    await screen.findByLabelText('Title');
    expect(screen.getByText(/2 products are/)).toBeInTheDocument();
  });

  it('keeps Save disabled until something changes', async () => {
    render(<AdminSaleSection />);
    const save = await screen.findByRole('button', { name: /Save and publish/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'ZAWADI20' } });
    expect(save).toBeEnabled();
  });

  it('saves a new code in capitals with the chosen percentage and logs it', async () => {
    api.save.mockResolvedValue(saved({ version: 5, couponCode: 'ZAWADI20', discountPercent: 20 }));
    render(<AdminSaleSection />);
    fireEvent.change(await screen.findByLabelText('Coupon code'), { target: { value: ' zawadi 20 ' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));

    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const input = api.save.mock.calls[0][0];
    expect(input.couponCode).toBe('ZAWADI20');
    expect(input.discountPercent).toBe(20);
    expect(input.isActive).toBe(true);

    await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1));
    expect(api.log.mock.calls[0][0]).toMatchObject({ action: 'sale.update', entityType: 'sale', entityId: 'weekend' });
    // The audit log records that a coupon exists, never the code itself.
    expect(JSON.stringify(api.log.mock.calls[0][0])).not.toContain('ZAWADI20');
    expect(api.toastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Saved version 5/)).toBeInTheDocument());
  });

  it('can switch the sale off and save', async () => {
    api.save.mockResolvedValue(saved({ isActive: false }));
    render(<AdminSaleSection />);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0].isActive).toBe(false);
  });

  it('refuses a bad code or percentage and explains why', async () => {
    render(<AdminSaleSection />);
    fireEvent.change(await screen.findByLabelText('Coupon code'), { target: { value: 'NO!' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/coupon code/i);
    expect(alert).toHaveTextContent(/discount/i);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('does not log or announce success when the save fails', async () => {
    api.save.mockRejectedValue(new Error('Only administrators can change the sale.'));
    render(<AdminSaleSection />);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));
    await waitFor(() => expect(api.toastError).toHaveBeenCalledWith('Only administrators can change the sale.'));
    expect(api.log).not.toHaveBeenCalled();
    expect(api.toastSuccess).not.toHaveBeenCalled();
  });

  it('discards unsaved edits', async () => {
    render(<AdminSaleSection />);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Oops' } });
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/i }));
    expect(screen.getByLabelText('Title')).toHaveValue('Weekend Sale');
  });

  it('previews the code as it will appear', async () => {
    render(<AdminSaleSection />);
    fireEvent.change(await screen.findByLabelText('Coupon code'), { target: { value: 'heri25' } });
    expect(screen.getAllByText('HERI25').length).toBeGreaterThan(0);
  });

  it('tells the admin to run the migration when the table is missing', async () => {
    api.fetch.mockRejectedValue(new Error('relation "public.site_sale" does not exist'));
    render(<AdminSaleSection />);
    expect(await screen.findByText(/20261124000000_site_sale\.sql/)).toBeInTheDocument();
  });

  it('starts from a switched-off blank form when nothing is saved', async () => {
    api.fetch.mockResolvedValue(null);
    render(<AdminSaleSection />);
    await screen.findByLabelText('Title');
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });
});
