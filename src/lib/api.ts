import { supabase } from './supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://192.168.68.60:8000';

async function apiFetch(path: string, options: RequestInit = {}, retries = 2): Promise<any> {
  console.log(`[API] Fetching: ${API_BASE}${path}`);

  let token: string | undefined;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
    console.log('[API] Got token:', token ? 'yes' : 'no');
  } catch (err) {
    console.log('[API] Could not get session:', err);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    console.log(`[API] Response status: ${res.status}`);

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Request failed' }));
      console.log('[API] Error response:', error);
      throw new Error(error.detail || 'Request failed');
    }

    const data = await res.json();
    console.log('[API] Success:', data);
    return data;
  } catch (err) {
    // Retry on network errors (TypeError), not on API errors
    if (retries > 0 && err instanceof TypeError) {
      console.log(`[API] Network error, retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 800));
      return apiFetch(path, options, retries - 1);
    }
    console.log('[API] Fetch error:', err);
    throw err;
  }
}

export const api = {
  // Drivers
  getMyDriverProfile: () => apiFetch('/drivers/me'),
  getNearbyDrivers: (lat: number, lng: number, radius: number = 5000) =>
    apiFetch(`/drivers?lat=${lat}&lng=${lng}&radius=${radius}`),

  updateDriverProfile: (data: {
    rate_per_mile?: number;
    minimum_payout?: number;
    latitude?: number;
    longitude?: number;
    is_online?: boolean;
  }) =>
    apiFetch('/drivers/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Orders
  getOrders: () => apiFetch('/orders'),
  getPendingOrders: () => apiFetch('/orders/pending'),

  createOrder: (data: {
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    delivery_instructions?: string;
    payment_method?: string;
  }) =>
    apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStripeConfig: () => apiFetch('/orders/config/stripe'),
  createSetupIntent: () => apiFetch('/profile/setup-intent', { method: 'POST' }),

  updateOrder: (orderId: string, data: { status: string; driver_id?: string; photo_url?: string }) =>
    apiFetch(`/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Messages
  getMessages: (orderId: string) => apiFetch(`/orders/${orderId}/messages`),
  sendMessage: (orderId: string, content: string) =>
    apiFetch(`/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  // Ratings
  rateOrder: (orderId: string, stars: number) =>
    apiFetch(`/orders/${orderId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ stars }),
    }),
  getOrderRating: (orderId: string) => apiFetch(`/orders/${orderId}/rating`),

  // Profile
  getProfile: () => apiFetch('/profile'),

  updateProfile: (data: { name?: string }) =>
    apiFetch('/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  savePushToken: (token: string) =>
    apiFetch(`/profile/push-token?token=${encodeURIComponent(token)}`, { method: 'POST' }),
};
