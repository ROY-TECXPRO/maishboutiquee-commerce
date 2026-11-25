import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: api.toastSuccess, error: api.toastError } }));
vi.mock('@/lib/adminActivity', () => ({ logAdminActivity: api.log }));
vi.mock('@/lib/adminProducts', () => ({ uploadProductImage: vi.fn() }));
vi.mock('@/lib/sitePopup', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sitePopup')>('@/lib/sitePopup');
  return { ...actual, fetchSitePopupStrict: api.fetch, saveSitePopup: api.save };
});

import { AdminPopupSection } from '@/components/admin/AdminPopupSection';
import type { SitePopupConfig } from '@/lib/sitePopup';

function saved(overrides: Partial<SitePopupConfig> = {}): SitePopupConfig {
  return {
    slug: 'seasonal',
    version: 2,
    isActive: true,
    badgeText: 'Customer Service Week',
    headline: 'Happy Customer Service Week dear customer!',
    subtitle: 'Shop with us.',
    highlightText: '',
    footerNote: '',
    imageUrl: '/images/image-pop.webp',
    productName: 'Nike Air Force 1 (Black)',
    price: 1500,
    originalPrice: 2500,
    sizes: ['39', '40'],
    ctaType: 'cart',
    ctaLabel: 'Add to Cart & Checkout',
    linkPath: '',
    delaySeconds: 5,
    startsAt: null,
    endsAt: null,
    updatedAt: '2026-11-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('AdminPopupSection', () => {
  beforeEach(() => {
    api.fetch.mockReset().mockResolvedValue(saved());
    api.save.mockReset();
    api.log.mockReset();
    api.toastError.mockReset();
    api.toastSuccess.mockReset();
  });
  afterEach(cleanup);

  it('loads the saved popup into the form and shows it as Live', async () => {
    render(<AdminPopupSection />);
    expect(await screen.findByLabelText('Headline')).toHaveValue('Happy Customer Service Week dear customer!');
    expect(screen.getByLabelText('Offer price (KES)')).toHaveValue('1500');
    expect(screen.getByLabelText(/^Sizes/)).toHaveValue('39, 40');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/Saved version 2/)).toBeInTheDocument();
  });

  it('keeps Save disabled until something changes', async () => {
    render(<AdminPopupSection />);
    const save = await screen.findByRole('button', { name: /Save and publish/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Black Friday!' } });
    expect(save).toBeEnabled();
  });

  it('saves the edited values and records the action in the audit log', async () => {
    api.save.mockResolvedValue(saved({ version: 3, headline: 'Black Friday!', price: 999 }));
    render(<AdminPopupSection />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: 'Black Friday!' } });
    fireEvent.change(screen.getByLabelText('Offer price (KES)'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));

    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const input = api.save.mock.calls[0][0];
    expect(input.headline).toBe('Black Friday!');
    expect(input.price).toBe(999);
    expect(input.originalPrice).toBe(2500);
    expect(input.sizes).toEqual(['39', '40']);
    expect(input.isActive).toBe(true);

    await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1));
    expect(api.log.mock.calls[0][0]).toMatchObject({ action: 'popup.update', entityType: 'popup', entityId: 'seasonal' });
    expect(api.toastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Saved version 3/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Save and publish/i })).toBeDisabled();
  });

  it('refuses to save an invalid form and explains why', async () => {
    render(<AdminPopupSection />);
    fireEvent.change(await screen.findByLabelText('Offer price (KES)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/offer price/i);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.toastError).toHaveBeenCalled();
  });

  it('allows saving a half-finished draft while switched off', async () => {
    api.save.mockResolvedValue(saved({ isActive: false, headline: '' }));
    render(<AdminPopupSection />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0].isActive).toBe(false);
  });

  it('does not log or announce success when the save fails', async () => {
    api.save.mockRejectedValue(new Error('Only administrators can change the popup.'));
    render(<AdminPopupSection />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and publish/i }));
    await waitFor(() => expect(api.toastError).toHaveBeenCalledWith('Only administrators can change the popup.'));
    expect(api.log).not.toHaveBeenCalled();
    expect(api.toastSuccess).not.toHaveBeenCalled();
  });

  it('discards unsaved edits', async () => {
    render(<AdminPopupSection />);
    const headline = await screen.findByLabelText('Headline');
    fireEvent.change(headline, { target: { value: 'Oops' } });
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/i }));
    expect(screen.getByLabelText('Headline')).toHaveValue('Happy Customer Service Week dear customer!');
  });

  it('tells the admin to run the migration when the table does not exist', async () => {
    api.fetch.mockRejectedValue(new Error('relation "public.site_popups" does not exist'));
    render(<AdminPopupSection />);
    expect(await screen.findByText(/20261122000000_site_popups\.sql/)).toBeInTheDocument();
  });

  it('starts from an empty, switched-off form when no row exists yet', async () => {
    api.fetch.mockResolvedValue(null);
    render(<AdminPopupSection />);
    expect(await screen.findByLabelText('Headline')).toHaveValue('');
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });
});
