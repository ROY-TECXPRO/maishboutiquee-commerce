import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  RefreshCw,
  Eye,
  AlertCircle,
  CalendarDays,
  MessageSquare,
  CheckCircle2,
  Save,
  Phone,
  MapPin,
  CreditCard,
  Package,
  Clock,
} from 'lucide-react';
import {
  getAllOrders,
  updateOrderManagement,
  type Order as SupabaseOrder,
  type OrderItem as SupabaseOrderItem,
  type OrderManagementUpdate,
} from '@/lib/supabase';
import {
  statusLabel,
  statusBadgeClass,
  isAwaitingReview,
  customerStatusMessage,
  formatPickupDate,
  ORDER_STATUS_VALUES,
  ORDER_WORKFLOW_ACTIONS,
  type OrderWorkflowAction,
} from '@/lib/orderStatus';
import { formatPrice } from '@/data/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type AdminOrder = SupabaseOrder & { items?: SupabaseOrderItem[] };

const STATUS_FILTERS = [
  { id: 'all', name: 'All statuses' },
  { id: 'awaiting', name: 'Awaiting review' },
  ...ORDER_STATUS_VALUES.map((value) => ({ id: value, name: statusLabel(value) })),
];

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Orders Management section of the EXISTING admin dashboard
 * (/admin/products -> Orders tab).
 *
 * Reads orders through the existing getAllOrders() helper (RLS limits
 * rows to staff) and writes through updateOrderManagement(), which is
 * guarded server-side by the orders UPDATE policy and the
 * protect_order_state() trigger — hiding buttons here is never the
 * security boundary.
 */
export function AdminOrdersSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickupDraft, setPickupDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['admin-orders'],
    queryFn: getAllOrders,
  });

  const orders = useMemo(
    () => (ordersQuery.data ?? []) as AdminOrder[],
    [ordersQuery.data]
  );

  const manageMutation = useMutation({
    mutationFn: ({
      id,
      patch,
      successMessage,
    }: {
      id: number;
      patch: OrderManagementUpdate;
      successMessage: string;
    }) => updateOrderManagement(id, patch).then(() => successMessage),
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success(message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  // Keep the pickup/message drafts in sync with the SAVED record whenever
  // a different order is opened or a save lands — the form always shows
  // what is actually persisted, never stale local state.
  useEffect(() => {
    setPickupDraft(selected?.pickup_date ?? '');
    setMessageDraft(selected?.status_message ?? '');
  }, [selectedId, selected?.pickup_date, selected?.status_message]);

  const awaitingCount = useMemo(
    () => orders.filter((order) => isAwaitingReview(order.status ?? 'pending')).length,
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !query ||
        order.order_number?.toLowerCase().includes(query) ||
        `${order.customer_first_name ?? ''} ${order.customer_last_name ?? ''}`
          .toLowerCase()
          .includes(query) ||
        order.customer_phone?.includes(query);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'awaiting'
          ? isAwaitingReview(order.status ?? 'pending')
          : order.status === statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const runWorkflowAction = (order: AdminOrder, action: OrderWorkflowAction) => {
    manageMutation.mutate({
      id: order.id as number,
      patch: { status: action.to },
      successMessage: action.successMessage,
    });
  };

  const savePickupDate = () => {
    if (!selected) return;
    manageMutation.mutate({
      id: selected.id as number,
      patch: { pickup_date: pickupDraft || null },
      successMessage: pickupDraft
        ? `Pickup date saved — customer sees: ${formatPickupDate(pickupDraft)}`
        : 'Pickup date cleared',
    });
  };

  const saveStatusMessage = () => {
    if (!selected) return;
    manageMutation.mutate({
      id: selected.id as number,
      patch: { status_message: messageDraft },
      successMessage: 'Customer status message saved',
    });
  };

  return (
    <div className="space-y-4 pt-4">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Orders Management</h2>
          <p className="text-sm text-muted-foreground">
            Review, approve and prepare customer orders. Updates are saved to the
            database and shown on the customer&rsquo;s order tracking page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {awaitingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <Clock className="h-3.5 w-3.5" />
              {awaitingCount} awaiting review
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
            aria-label="Refresh orders"
          >
            <RefreshCw
              className={cn('mr-1.5 h-3.5 w-3.5', ordersQuery.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ---- Toolbar: search + status filter ---- */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by reference, customer or phone"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.id} value={filter.id}>
              {filter.name}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Loading / error / empty / list ---- */}
      {ordersQuery.isLoading ? (
        <div
          className="flex items-center justify-center gap-2 rounded-md border border-border py-16 text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading orders…
        </div>
      ) : ordersQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 py-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">
            {(ordersQuery.error as Error)?.message || 'Failed to load orders'}
          </p>
          <Button variant="outline" size="sm" onClick={() => void ordersQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-md border border-border py-12 text-center text-muted-foreground">
          {orders.length === 0
            ? 'No orders yet. New customer orders appear here automatically.'
            : 'No orders match your search or filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const status = order.status ?? 'pending';
                const awaiting = isAwaitingReview(status);
                const itemCount = (order.items ?? []).reduce(
                  (sum, item) => sum + (item.quantity ?? 0),
                  0
                );
                return (
                  <TableRow
                    key={order.id}
                    className={cn(awaiting && 'bg-amber-50/60 dark:bg-amber-500/5')}
                  >
                    <TableCell>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">#{order.id}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(order.created_at)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {order.customer_first_name} {order.customer_last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {itemCount} item{itemCount === 1 ? '' : 's'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPrice(order.total ?? 0)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                          statusBadgeClass(status)
                        )}
                      >
                        {statusLabel(status)}
                      </span>
                      {awaiting && (
                        <span className="mt-1 block text-xs font-medium text-amber-700">
                          Awaiting review
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedId(order.id as number)}
                        aria-label={`View order ${order.order_number}`}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---- Order detail dialog ---- */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => (!open ? setSelectedId(null) : undefined)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  Order {selected.order_number}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      statusBadgeClass(selected.status ?? 'pending')
                    )}
                  >
                    {statusLabel(selected.status ?? 'pending')}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Customer & delivery */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Phone className="h-4 w-4 text-primary" />
                    Customer &amp; delivery
                  </h4>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {selected.customer_first_name} {selected.customer_last_name}
                    </p>
                    <p>
                      {selected.customer_phone}
                      {selected.customer_email ? ` · ${selected.customer_email}` : ''}
                    </p>
                    <p className="flex items-start gap-1">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {selected.shipping_address}, {selected.shipping_town},{' '}
                      {selected.shipping_county}
                    </p>
                    {selected.shipping_instructions && (
                      <p>Note: {selected.shipping_instructions}</p>
                    )}
                    <p className="text-xs">
                      Submitted {formatDate(selected.created_at)} · Last updated{' '}
                      {formatDate(selected.updated_at)}
                    </p>
                  </div>
                </div>

                {/* Payment & totals */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Payment
                    </h4>
                    <div className="grid gap-1 text-sm text-muted-foreground">
                      <p>
                        Method:{' '}
                        <span className="font-medium text-foreground">
                          {selected.payment_method}
                        </span>
                      </p>
                      <p>
                        Payment status:{' '}
                        <span className="font-medium text-foreground">
                          {selected.payment_status}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="mb-2 text-sm font-semibold">Order summary</h4>
                    <div className="grid gap-1 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatPrice(selected.subtotal ?? 0)}</span>
                      </div>
                      {selected.discount ? (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount</span>
                          <span>-{formatPrice(selected.discount)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between">
                        <span>
                          Delivery
                          {selected.delivery_zone ? ` (${selected.delivery_zone})` : ''}
                        </span>
                        <span>{formatPrice(selected.delivery_price ?? 0)}</span>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-semibold text-foreground">
                        <span>Total</span>

                {/* Items */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 text-primary" />
                    Items ({(selected.items ?? []).length})
                  </h4>
                  {(selected.items ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(selected.items ?? []).map((item) => (
                        <li
                          key={item.id ?? `${item.product_id}-${item.selected_size}-${item.selected_color}`}
                          className="flex items-center gap-3"
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.product_name}
                              className="h-14 w-12 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded bg-muted">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.selected_color}
                              {item.selected_size ? ` · ${item.selected_size}` : ''} · Qty{' '}
                              {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium">
                            {formatPrice((item.price ?? 0) * (item.quantity ?? 0))}

                {/* ---- Workflow actions ---- */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-1 text-sm font-semibold">Workflow</h4>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Each action is saved to the database and shown immediately on the
                    customer&rsquo;s order-tracking page.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_WORKFLOW_ACTIONS.filter((action) =>
                      action.from.includes(selected.status ?? 'pending')
                    ).map((action) => {
                      const isPrimary = action.id === 'acknowledge' || action.id === 'approve';
                      return (
                        <Button
                          key={action.id}
                          size="sm"
                          variant={isPrimary ? 'default' : 'outline'}
                          disabled={manageMutation.isPending}
                          onClick={() => runWorkflowAction(selected, action)}
                        >
                          {manageMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {action.label}
                        </Button>
                      );
                    })}
                    {ORDER_WORKFLOW_ACTIONS.every(
                      (action) => !action.from.includes(selected.status ?? 'pending')
                    ) && (
                      <p className="text-sm text-muted-foreground">
                        This order is in a final state. Use the status list below if you
                        need to move it back to an earlier stage.
                      </p>
                    )}
                  </div>
                </div>

                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                        <span>{formatPrice(selected.total ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>


                {/* Payment & totals */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Payment
                    </h4>
                    <div className="grid gap-1 text-sm text-muted-foreground">
                      <p>
                        Method:{' '}
                        <span className="font-medium text-foreground">
                          {selected.payment_method}
                        </span>
                      </p>
                      <p>
                        Payment status:{' '}
                        <span className="font-medium text-foreground">
                          {selected.payment_status}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="mb-2 text-sm font-semibold">Order summary</h4>
                    <div className="grid gap-1 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatPrice(selected.subtotal ?? 0)}</span>
                      </div>
                      {selected.discount ? (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount</span>
                          <span>-{formatPrice(selected.discount)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between">
                        <span>
                          Delivery
                          {selected.delivery_zone ? ` (${selected.delivery_zone})` : ''}
                        </span>
                        <span>{formatPrice(selected.delivery_price ?? 0)}</span>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-semibold text-foreground">
                        <span>Total</span>
                        <span>{formatPrice(selected.total ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 text-primary" />
                    Items ({(selected.items ?? []).length})
                  </h4>
                  {(selected.items ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(selected.items ?? []).map((item) => (
                        <li
                          key={item.id ?? `${item.product_id}-${item.selected_size}-${item.selected_color}`}
                          className="flex items-center gap-3"
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.product_name}
                              className="h-14 w-12 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded bg-muted">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.selected_color}
                              {item.selected_size ? ` · ${item.selected_size}` : ''} · Qty{' '}
                              {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium">
                            {formatPrice((item.price ?? 0) * (item.quantity ?? 0))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>


                {/* ---- Workflow actions ---- */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-1 text-sm font-semibold">Workflow</h4>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Each action is saved to the database and shown immediately on the
                    customer&rsquo;s order-tracking page.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_WORKFLOW_ACTIONS.filter((action) =>
                      action.from.includes(selected.status ?? 'pending')
                    ).map((action) => {
                      const isPrimary =
                        action.id === 'acknowledge' || action.id === 'approve';
                      return (
                        <Button
                          key={action.id}
                          size="sm"
                          variant={isPrimary ? 'default' : 'outline'}
                          disabled={manageMutation.isPending}
                          onClick={() => runWorkflowAction(selected, action)}
                        >
                          {manageMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {action.label}
                        </Button>
                      );
                    })}
                    {ORDER_WORKFLOW_ACTIONS.every(
                      (action) => !action.from.includes(selected.status ?? 'pending')
                    ) && (
                      <p className="text-sm text-muted-foreground">
                        This order is in a final state. Use the status list below if you
                        need to move it back to an earlier stage.
                      </p>
                    )}
                  </div>
                </div>


                {/* ---- Pickup date (separate from ready status) ---- */}
                <div className="rounded-lg border border-border p-4">
                  <label
                    htmlFor="pickup-date"
                    className="mb-1 flex items-center gap-2 text-sm font-semibold"
                  >
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Estimated pickup date
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Saved independently — entering a date does not mark the order ready.
                    The customer sees it as{' '}
                    <span className="italic">
                      &ldquo;Your order will be ready for pickup by [date].&rdquo;
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="pickup-date"
                      type="date"
                      value={pickupDraft}
                      onChange={(event) => setPickupDraft(event.target.value)}
                      className="w-48"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        manageMutation.isPending ||
                        pickupDraft === (selected.pickup_date ?? '')
                      }
                      onClick={savePickupDate}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save date
                    </Button>
                    {selected.pickup_date && (
                      <span className="text-sm text-muted-foreground">
                        Customer sees: {formatPickupDate(selected.pickup_date)}
                      </span>
                    )}
                  </div>
                </div>


                {/* ---- Customer-facing status message ---- */}
                <div className="rounded-lg border border-border p-4">
                  <label
                    htmlFor="status-message"
                    className="mb-1 flex items-center gap-2 text-sm font-semibold"
                  >
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Message to customer
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Shown verbatim on the customer&rsquo;s tracking page. Leave blank to
                    use the default message for the current stage.
                  </p>
                  <div className="space-y-2">
                    <Input
                      id="status-message"
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder={
                        customerStatusMessage(
                          selected.status ?? 'pending',
                          selected.status_message
                        )
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          manageMutation.isPending ||
                          messageDraft === (selected.status_message ?? '')
                        }
                        onClick={saveStatusMessage}
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save message
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Default: &ldquo;
                        {customerStatusMessage(selected.status ?? 'pending')}&rdquo;
                      </span>
                    </div>
                  </div>
                </div>

                {/* ---- Free status override (legacy / corrections) ---- */}
                <div className="rounded-lg border border-border p-4">
                  <label
                    htmlFor="status-override"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Set status manually
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    For legacy statuses and corrections. Prefer the workflow buttons
                    above for the normal pickup flow.
                  </p>
                  <select
                    id="status-override"
                    value={selected.status ?? 'pending'}
                    disabled={manageMutation.isPending}
                    onChange={(event) =>
                      manageMutation.mutate({
                        id: selected.id as number,
                        patch: { status: event.target.value },
                        successMessage: `Status set to "${statusLabel(event.target.value)}".`,
                      })
                    }
                    className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20"
                  >
                    {ORDER_STATUS_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                    {selected.status &&
                      !ORDER_STATUS_VALUES.includes(selected.status) && (
                        <option value={selected.status}>{statusLabel(selected.status)}</option>
                      )}
                  </select>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

