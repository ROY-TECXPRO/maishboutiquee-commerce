import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DesktopHeader } from '@/components/navigation/DesktopHeader';
import { BottomNav } from '@/components/navigation/BottomNav';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { UpdatePrompt } from '@/registerServiceWorker';
import { Footer } from '@/components/layout/Footer';
import { useLiveCatalog } from '@/lib/catalog';
import { CustomerWeekOffer } from '@/components/customer-week/CustomerWeekOffer';
import { FloatingWhatsApp } from '@/components/whatsapp/FloatingWhatsApp';


export const Layout: React.FC = () => {
  const location = useLocation();

  // Admin changes to products (the Offer switch, prices, stock...) reach every
  // open tab at once, so the homepage Offers row and the Sale page stay current.
  useLiveCatalog();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <CustomerWeekOffer />

      <DesktopHeader />
      
      <main className="flex-1 pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />
      <BottomNav />
      <InstallPrompt />
      <UpdatePrompt />
      {location.pathname === '/' && <FloatingWhatsApp />}
    </div>
  );
};
