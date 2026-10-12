import { describe, it, expect } from 'vitest';

/**
 * Tests for the shared order-management vocabulary in `orderStatus.ts`.
 *
 * This module is the single source of truth used by BOTH the admin Orders
 * Management section and the customer order-tracking page, so verifying it
 * here verifies that the admin's acknowledge/approve/ready/collected actions
 * map to the exact customer-facing wording the task requires, and that the
 * pickup date renders in a localized format from the saved record.
 */

import {
  ORDER_WORKFLOW_ACTIONS,
  customerStatusMessage,
  formatPickupDate,
  isAwaitingReview,
  statusBadgeClass,
  statusLabel,
} from '@/lib/orderStatus';

describe('order status labels', () => {
  it('labels the five workflow stages', () => {
    expect(statusLabel('pending')).toBe('Pending review');
    expect(statusLabel('received')).toBe('Received');
    expect(statusLabel('confirmed')).toBe('Confirmed');
    expect(statusLabel('ready_for_pickup')).toBe('Ready for pickup');
    expect(statusLabel('collected')).toBe('Collected');
  });

  it('preserves legacy statuses so existing records still render', () => {
    expect(statusLabel('processing')).toBe('Processing');
    expect(statusLabel('shipped')).toBe('Shipped');
    expect(statusLabel('delivered')).toBe('Delivered');
    expect(statusLabel('cancelled')).toBe('Cancelled');
  });

  it('degrades gracefully on an unknown status', () => {
    expect(statusLabel('weird_value')).toBe('Weird value');
  });
});

describe('customer-facing status messages', () => {
  it('Stage 1 — pending review', () => {
    expect(customerStatusMessage('pending')).toBe(
      'Your order has been submitted and is pending review.'
    );
  });

  it('Stage 2 — received awaiting approval (must NOT imply approved)', () => {
    expect(customerStatusMessage('received')).toBe(
      'Your order has been received and is awaiting approval.'
    );
  });

  it('Stage 3 — confirmed', () => {
    expect(customerStatusMessage('confirmed')).toBe('Your order has been confirmed.');
  });

  it('Stage 4 — ready for pickup', () => {
    expect(customerStatusMessage('ready_for_pickup')).toBe(
      'Your order is ready for pickup.'
    );
  });

  it('Stage 5 — collected', () => {
    expect(customerStatusMessage('collected')).toContain('collected');
  });

  it('a staff-authored status_message overrides the default text', () => {
    expect(
      customerStatusMessage('confirmed', '  We stitched it just for you.  ')
    ).toBe('We stitched it just for you.');
  });

  it('a blank staff message falls back to the stage default', () => {
    expect(customerStatusMessage('confirmed', '   ')).toBe(
      'Your order has been confirmed.'
    );
  });
});

describe('awaiting-review flag drives the admin "awaiting review" highlight', () => {
  it('is true for pending and received', () => {
    expect(isAwaitingReview('pending')).toBe(true);
    expect(isAwaitingReview('received')).toBe(true);
  });

  it('is false once confirmed or later', () => {
    expect(isAwaitingReview('confirmed')).toBe(false);
    expect(isAwaitingReview('ready_for_pickup')).toBe(false);
    expect(isAwaitingReview('collected')).toBe(false);
  });
});

describe('workflow actions offer only legal transitions', () => {
  const actionFor = (id: string) =>
    ORDER_WORKFLOW_ACTIONS.find((a) => a.id === id)!;

  it('acknowledge moves pending -> received', () => {
    const ack = actionFor('acknowledge');
    expect(ack.to).toBe('received');
    expect(ack.from).toContain('pending');
    expect(ack.from).not.toContain('received');
  });

  it('approve moves pending/received -> confirmed (never straight from confirmed)', () => {
    const approve = actionFor('approve');
    expect(approve.to).toBe('confirmed');
    expect(approve.from).toEqual(expect.arrayContaining(['pending', 'received']));
    expect(approve.from).not.toContain('confirmed');
  });

  it('ready-for-pickup is only offered from confirmed', () => {
    const ready = actionFor('ready');
    expect(ready.to).toBe('ready_for_pickup');
    expect(ready.from).toEqual(['confirmed']);
  });

  it('collected is offered from confirmed or ready_for_pickup', () => {
    const collected = actionFor('collected');
    expect(collected.to).toBe('collected');
    expect(collected.from).toEqual(expect.arrayContaining(['confirmed', 'ready_for_pickup']));
  });
});

describe('pickup date formatting', () => {
  it('renders a saved YYYY-MM-DD column in a localized, unambiguous format', () => {
    // Parsed as a plain calendar date so a UTC column never slips a day.
    expect(formatPickupDate('2026-10-18')).toBe('18 October 2026');
  });

  it('returns null when no date has been entered', () => {
    expect(formatPickupDate(null)).toBeNull();
    expect(formatPickupDate(undefined)).toBeNull();
    expect(formatPickupDate('')).toBeNull();
  });
});

describe('status badge styling', () => {
  it('returns distinct classes per stage and a safe fallback', () => {
    expect(statusBadgeClass('pending')).toContain('yellow');
    expect(statusBadgeClass('received')).toContain('blue');
    expect(statusBadgeClass('collected')).toContain('green');
    expect(statusBadgeClass('totally-unknown')).toBe('bg-muted text-muted-foreground');
  });
});
