/**
 * Shared order-status vocabulary for the admin Orders Management section
 * and the customer order-tracking page (OrdersPage).
 *
 * The database column `orders.status` is plain TEXT with no CHECK
 * constraint, so the pickup workflow stages were added as new values
 * (see supabase/migrations/20261014000000_order_management.sql). Legacy
 * values (processing, shipped, delivered, cancelled) remain valid and
 * are preserved here so existing orders keep rendering correctly.
 */

export interface OrderStatusMeta {
  /** Label shown to admins and customers. */
  label: string;
  /** Tailwind classes for the status pill. */
  badgeClass: string;
  /**
   * Default customer-facing message for this stage. A staff-written
   * `status_message` on the order always takes precedence.
   */
  customerMessage: string;
  /** True while the order still needs admin review (stages 1-2). */
  awaitingReview?: boolean;
}

export const ORDER_STATUS_META: Record<string, OrderStatusMeta> = {
  pending: {
    label: 'Pending review',
    badgeClass: 'bg-yellow-100 text-yellow-800',
    customerMessage: 'Your order has been submitted and is pending review.',
    awaitingReview: true,
  },
  received: {
    label: 'Received',
    badgeClass: 'bg-blue-100 text-blue-900',
    customerMessage: 'Your order has been received and is awaiting approval.',
    awaitingReview: true,
  },
  confirmed: {
    label: 'Confirmed',
    badgeClass: 'bg-indigo-100 text-indigo-900',
    customerMessage: 'Your order has been confirmed.',
  },
  ready_for_pickup: {
    label: 'Ready for pickup',
    badgeClass: 'bg-purple-100 text-purple-900',
    customerMessage: 'Your order is ready for pickup.',
  },
  collected: {
    label: 'Collected',
    badgeClass: 'bg-green-100 text-green-800',
    customerMessage: 'This order has been collected. Thank you!',
  },
  // ---- Legacy statuses, preserved exactly as before ----
  processing: {
    label: 'Processing',
    badgeClass: 'bg-blue-100 text-blue-800',
    customerMessage: 'Your order is being processed.',
  },
  shipped: {
    label: 'Shipped',
    badgeClass: 'bg-purple-100 text-purple-800',
    customerMessage: 'Your order has been shipped.',
  },
  delivered: {
    label: 'Delivered',
    badgeClass: 'bg-green-100 text-green-800',
    customerMessage: 'Your order has been delivered.',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-red-100 text-red-800',
    customerMessage: 'Your order has been cancelled.',
  },
};

/** All statuses in workflow order (drives the admin status dropdowns). */
export const ORDER_STATUS_VALUES = Object.keys(ORDER_STATUS_META);

/** Human label for any status; unknown/legacy values degrade gracefully. */
export function statusLabel(status: string): string {
  const meta = ORDER_STATUS_META[status];
  if (meta) return meta.label;
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

/** Badge classes for a status pill. */
export function statusBadgeClass(status: string): string {
  return ORDER_STATUS_META[status]?.badgeClass ?? 'bg-muted text-muted-foreground';
}

/** True while the order still needs an admin review decision. */
export function isAwaitingReview(status: string): boolean {
  return ORDER_STATUS_META[status]?.awaitingReview === true;
}

/**
 * The message the customer sees: a staff-authored status_message wins
 * over the default text for the stage.
 */
export function customerStatusMessage(
  status: string,
  staffMessage?: string | null
): string {
  const custom = (staffMessage ?? '').trim();
  if (custom) return custom;
  return ORDER_STATUS_META[status]?.customerMessage ?? 'Your order status is being updated.';
}

/**
 * Formats a `YYYY-MM-DD` date column for display ("18 October 2026").
 *
 * The date is parsed as a plain calendar date (midnight local) so a UTC
 * date column can never render as the previous day. Locale defaults to
 * en-GB (day-month-year) and is injectable for tests.
 */
export function formatPickupDate(value?: string | null, locale = 'en-GB'): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Workflow actions offered to staff, in order. `from` lists the statuses
 * the action is offered from so the UI never presents an impossible
 * transition; legacy statuses remain editable through the free status
 * dropdown in the order dialog.
 */
export interface OrderWorkflowAction {
  id: 'acknowledge' | 'approve' | 'ready' | 'collected';
  label: string;
  /** Status written when the action is taken. */
  to: string;
  from: string[];
  /** Message shown to the admin on success. */
  successMessage: string;
}

export const ORDER_WORKFLOW_ACTIONS: OrderWorkflowAction[] = [
  {
    id: 'acknowledge',
    label: 'Acknowledge receipt',
    to: 'received',
    from: ['pending'],
    successMessage: 'Order acknowledged — the customer sees "awaiting approval".',
  },
  {
    id: 'approve',
    label: 'Approve order',
    to: 'confirmed',
    from: ['pending', 'received'],
    successMessage: 'Order approved — the customer sees "confirmed".',
  },
  {
    id: 'ready',
    label: 'Mark ready for pickup',
    to: 'ready_for_pickup',
    from: ['confirmed'],
    successMessage: 'Order marked ready for pickup.',
  },
  {
    id: 'collected',
    label: 'Mark collected / completed',
    to: 'collected',
    from: ['confirmed', 'ready_for_pickup'],
    successMessage: 'Order marked as collected.',
  },
];
