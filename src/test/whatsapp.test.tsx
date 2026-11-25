import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { OrderProvider } from '@/context/OrderContext';
import { AuthProvider } from '@/context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const renderWithProviders = (pathname: string) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <OrderProvider>
              <MemoryRouter initialEntries={[pathname]}>
                <Layout />
              </MemoryRouter>
            </OrderProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('FloatingWhatsApp', () => {
  it('renders on home page "/"', () => {
    renderWithProviders('/');
    const whatsappLink = screen.getByRole('link', { name: /chat on whatsapp for emergency service/i });
    expect(whatsappLink).toBeInTheDocument();
    expect(whatsappLink).toHaveAttribute('href', 'https://wa.me/254799921036?text=Hello%20Maish%2C%20I%20need%20emergency%20service');
    expect(whatsappLink).toHaveAttribute('target', '_blank');
    expect(whatsappLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render on "/cart"', () => {
    renderWithProviders('/cart');
    const whatsappLink = screen.queryByRole('link', { name: /chat on whatsapp for emergency service/i });
    expect(whatsappLink).not.toBeInTheDocument();
  });

  it('does not render on "/product/women-dress-001"', () => {
    renderWithProviders('/product/women-dress-001');
    const whatsappLink = screen.queryByRole('link', { name: /chat on whatsapp for emergency service/i });
    expect(whatsappLink).not.toBeInTheDocument();
  });

  it('does not render on "/admin/products"', () => {
    renderWithProviders('/admin/products');
    const whatsappLink = screen.queryByRole('link', { name: /chat on whatsapp for emergency service/i });
    expect(whatsappLink).not.toBeInTheDocument();
  });
});