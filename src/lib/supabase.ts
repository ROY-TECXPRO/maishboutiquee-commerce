import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials — read from the build environment ONLY.
//
// SECURITY: there is deliberately no hardcoded fallback key here. Anything in
// this file is published to GitHub and shipped inside the public JS bundle.
// The anon/publishable key is designed to be visible, but hardcoding it still
// prevents rotation and hides the fact that it is unset on some deploys.
//
// Set these in Netlify: Site settings > Environment variables
//   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<the publishable/anon key from Project Settings > API>
//
// These are the *public* keys (safe in the browser, protected by Row Level
// Security). The service-role / secret key bypasses RLS entirely and must
// never be referenced from client code or committed — it belongs in
// .env.migration for server-side scripts only.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly and early rather than silently building a client that
  // authenticates against nothing.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Set them in .env for local development and in your host\'s ' +
      'environment-variable settings for production.',
  );
}

// Custom fetch with timeout
const fetchWithTimeout = (url: string | URL | Request, options: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeoutMs = 10000; // 10 second timeout
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).catch((error) => {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeoutId);
  });
};

// Create Supabase client with timeout settings
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

export { supabase };

/**
 * Confine an in-app link target to this origin.
 *
 * React Router 6 is affected by GHSA-wrjc-x8rr-h8h6 (open redirect through a
 * backslash-prefixed path) and GHSA-2j2x-hqr9-3h42 (protocol-relative "//host"
 * reinterpretation). The patched release is a v7 major upgrade, so rather than
 * take that on in a security pass, every navigation target is passed through
 * this guard: anything protocol-relative, backslash-prefixed, or schemed is
 * rejected and the caller falls back to a known-good internal path. This makes
 * the redirect unreachable regardless of the router version in use.
 */
export const safeInternalPath = (target: unknown, fallback = '/'): string => {
  if (typeof target !== 'string') return fallback;

  const value = target.trim();
  if (value.length === 0) return fallback;

  // Protocol-relative or backslash-prefixed. A leading backslash is the
  // CVE-2025-68470 bypass: browsers normalise "\evil.example" into
  // "//evil.example", which resolves off-origin. Reject runs of 2+ slashes or
  // backslashes, and any lone leading backslash.
  if (/^[/\\]{2,}/.test(value)) return fallback;
  if (value.startsWith('\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;

  // Control characters can be used to smuggle a scheme past a naive check.
  // eslint-disable-next-line no-control-regex -- matching control bytes here is the point
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  // Otherwise it is an in-app path ("/orders", "./x", "orders").
  return value;
};

// Database types
export interface Order {
  id?: number;
  user_id?: string;
  order_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email?: string;
  shipping_county: string;
  shipping_town: string;
  shipping_address: string;
  shipping_instructions?: string;
  payment_method: string;
  payment_status: string;
  delivery_zone: string;
  delivery_price: number;
  delivery_status: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  /** Staff-entered estimated pickup date (YYYY-MM-DD), nullable. */
  pickup_date?: string | null;
  /** Staff-written customer-facing status message, nullable. */
  status_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
  selected_size: string;
  selected_color: string;
  color_hex?: string;
  image?: string;
}

// Order functions with better error handling
export const saveOrder = async (order: Order, items: OrderItem[]) => {
  try {
    // Insert order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert(order)
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      throw new Error(`Database error: ${orderError.message}`);
    }

    // Insert order items with order_id
    const itemsWithOrderId = items.map(item => ({
      ...item,
      order_id: orderData.id
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId);

    if (itemsError) {
      console.error('Order items insert error:', itemsError);
      throw new Error(`Database error: ${itemsError.message}`);
    }

    return orderData;
  } catch (error) {
    console.error('Save order error:', error);
    throw error;
  }
};

export const getOrders = async () => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Get orders error:', ordersError);
      throw new Error(`Database error: ${ordersError.message}`);
    }

    // Get items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order) => {
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);

        if (itemsError) {
          console.error('Get order items error:', itemsError);
          return { ...order, items: [] };
        }

        return { ...order, items: items || [] };
      })
    );

    return ordersWithItems;
  } catch (error) {
    console.error('Get orders error:', error);
    throw error;
  }
};

// Escape the LIKE metacharacters so a caller-supplied string cannot widen
// the pattern. Without this, a phone of "%" would match every order the RLS
// policy would otherwise allow.
const escapeLikePattern = (value: string) =>
  value.replace(/([\\%_])/g, '\\$1');

export const getOrdersByPhone = async (phone: string) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('customer_phone', `%${escapeLikePattern(phone.trim())}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get orders by phone error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order) => {
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);

        if (itemsError) {
          console.error('Get order items error:', itemsError);
          return { ...order, items: [] };
        }
        return { ...order, items: items || [] };
      })
    );

    return ordersWithItems;
  } catch (error) {
    console.error('Get orders by phone error:', error);
    throw error;
  }
};

// Get orders by user ID (for logged-in users)
export const getOrdersByUserId = async (userId: string) => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Get orders by user error:', ordersError);
      throw new Error(`Database error: ${ordersError.message}`);
    }

    // Get items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order) => {
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);

        if (itemsError) {
          console.error('Get order items error:', itemsError);
          return { ...order, items: [] };
        }

        return { ...order, items: items || [] };
      })
    );

    return ordersWithItems;
  } catch (error) {
    console.error('Get orders by user error:', error);
    throw error;
  }
};

// Get all orders (for admin view only)
export const getAllOrders = async () => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Get all orders error:', ordersError);
      throw new Error(`Database error: ${ordersError.message}`);
    }

    // Get items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order) => {
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);

        if (itemsError) {
          console.error('Get order items error:', itemsError);
          return { ...order, items: [] };
        }

        return { ...order, items: items || [] };
      })
    );

    return ordersWithItems;
  } catch (error) {
    console.error('Get all orders error:', error);
    throw error;
  }
};

export const updateOrderStatus = async (orderId: number, status: string) => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      console.error('Update order status error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
  } catch (error) {
    console.error('Update order status error:', error);
    throw error;
  }
};

/** Fields the admin Orders Management section may write on an order. */
export interface OrderManagementUpdate {
  status?: string;
  pickup_date?: string | null;
  status_message?: string | null;
}

/**
 * Staff update for the Orders Management section (status workflow,
 * pickup date, customer-facing message).
 *
 * Security is enforced server-side, not here: the orders UPDATE RLS
 * policy only matches rows owned by the caller or any staff row, and
 * protect_order_state() rejects customers who try to move status or
 * touch pickup_date/status_message. Because RLS filters the update
 * itself, a caller with no rights affects zero rows — surfaced below as
 * an explicit error instead of a silent success.
 */
export const updateOrderManagement = async (
  orderId: number,
  patch: OrderManagementUpdate
): Promise<void> => {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id');

  if (error) {
    console.error('Update order error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('Not authorised to update this order, or it no longer exists.');
  }
};

export const deleteOrder = async (orderId: number) => {
  try {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      console.error('Delete order error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
  } catch (error) {
    console.error('Delete order error:', error);
    throw error;
  }
};