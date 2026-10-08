import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from '@/context/CartContext';
import CustomerWeekOffer from '@/components/customer-week/CustomerWeekOffer';

/**
 * Regression tests for the Customer Service Week popup.
 *
 * The original white-page bug was `useLocation()` being called at MODULE
 * SCOPE (outside the component). Importing the module alone throws in that
 * case, so the static import above is itself the first assertion.
 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

function renderPopup(path = '/'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider>
        <Routes>
          <Route path="*" element={<CustomerWeekOffer />} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
  );
}

const DISMISS_KEY = 'csw-week-popup-dismissed';

describe('CustomerWeekOffer popup', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    sessionStorage.clear();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is importable without calling hooks at module scope', () => {
    expect(typeof CustomerWeekOffer).toBe('function');
  });

  it('pops up after 5 seconds with the welcome message and offer', () => {
    renderPopup();
    expect(screen.queryByText(/Happy Customer Service Week/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/Happy Customer Service Week dear customer!/i)).toBeInTheDocument();
    expect(screen.getByText(/30% offers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Cart & Checkout/i })).toBeInTheDocument();
  });

  it('can be cancelled and stays dismissed for the session', () => {
    renderPopup();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Happy Customer Service Week/i)).toBeInTheDocument();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBeNull();

    // The cancel button records the dismissal.
    act(() => {
      screen.getByRole('button', { name: /Cancel \/ close offer/i }).click();
    });
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('true');

    // A fresh mount later in the same session must not pop up again.
    cleanup();
    renderPopup();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/Happy Customer Service Week/i)).toBeNull();
  });

  it('does not interrupt checkout or cart', () => {
    renderPopup('/checkout');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/Happy Customer Service Week/i)).toBeNull();

    cleanup();
    renderPopup('/cart');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/Happy Customer Service Week/i)).toBeNull();
  });
});
