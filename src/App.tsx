import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense } from "react";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { OrderProvider } from "@/context/OrderContext";
import { AuthProvider } from "@/context/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { PageLoader } from "@/components/ui/PageLoader";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { RedirectToHomeOnLoad } from "@/components/ui/RedirectToHomeOnLoad";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { AdminRoute } from "@/components/admin/AdminRoute";

// Lazy-loaded page components - code splitting for better initial load performance
const HomePage = React.lazy(() => import("./pages/HomePage"));
const CategoryPage = React.lazy(() => import("./pages/CategoryPage"));
const CategoriesPage = React.lazy(() => import("./pages/CategoriesPage"));
const ProductDetailPage = React.lazy(() => import("./pages/ProductDetailPage"));
const SearchPage = React.lazy(() => import("./pages/SearchPage"));
const CartPage = React.lazy(() => import("./pages/CartPage"));
const AccountPage = React.lazy(() => import("./pages/AccountPage"));
const SalePage = React.lazy(() => import("./pages/SalePage"));
const NewArrivalsPage = React.lazy(() => import("./pages/NewArrivalsPage"));
const WishlistPage = React.lazy(() => import("./pages/WishlistPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const PrivacyPolicyPage = React.lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfServicePage = React.lazy(() => import("./pages/TermsOfServicePage"));
const AboutPage = React.lazy(() => import("./pages/AboutPage"));
const ShippingInfoPage = React.lazy(() => import("./pages/ShippingInfoPage"));
const FAQPage = React.lazy(() => import("./pages/FAQPage"));
const CheckoutPage = React.lazy(() => import("./pages/CheckoutPage"));
const OrdersPage = React.lazy(() => import("./pages/OrdersPage"));
const LocationPage = React.lazy(() => import("./pages/LocationPage"));
const SavedAddressesPage = React.lazy(() => import("./pages/SavedAddressesPage"));
const PaymentMethodsPage = React.lazy(() => import("./pages/PaymentMethodsPage"));
const NotificationsPage = React.lazy(() => import("./pages/NotificationsPage"));
const HelpSupportPage = React.lazy(() => import("./pages/HelpSupportPage"));
const AdminLoginPage = React.lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminProductsPage = React.lazy(() => import("./pages/admin/AdminProductsPage"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <OrderProvider>
              <Toaster />
              <Sonner position="top-center" />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ScrollToTop />
                <RedirectToHomeOnLoad />
                <PageLoader />
                <RouteSeo />
                <Suspense fallback={null}>
                  <Routes>
                  {/* Admin routes render outside the storefront Layout (no nav/footer/promo banner) */}
                  <Route path="/admin/login" element={<AdminLoginPage />} />
                  <Route
                    path="/admin/products"
                    element={
                      <AdminRoute>
                        <AdminProductsPage />
                      </AdminRoute>
                    }
                  />

                  <Route element={<Layout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                    <Route path="/category/:categoryId" element={<CategoryPage />} />
                    <Route path="/product/:productId" element={<ProductDetailPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/sale" element={<SalePage />} />
                    <Route path="/new-arrivals" element={<NewArrivalsPage />} />
                    <Route path="/wishlist" element={<WishlistPage />} />
                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
                    <Route path="/terms" element={<TermsOfServicePage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/shipping" element={<ShippingInfoPage />} />
                    <Route path="/faqs" element={<FAQPage />} />
                    <Route path="/location" element={<LocationPage />} />
                    <Route path="/addresses" element={<SavedAddressesPage />} />
                    <Route path="/payments" element={<PaymentMethodsPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/help" element={<HelpSupportPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
                </Suspense>
              </BrowserRouter>
            </OrderProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;