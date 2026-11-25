import React from 'react';
import { useLocation } from 'react-router-dom';
import { WHATSAPP_URL } from '@/lib/siteConfig';

export const FloatingWhatsApp: React.FC = () => {
  const location = useLocation();

  if (location.pathname !== '/') return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp for emergency service"
      className="fixed bottom-6 right-4 md:bottom-[1.5rem] md:right-[1.5rem] z-50 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/50"
      style={{ background: 'transparent' }}
    >
      <img
        src="/images/iconwhatsaap.png"
        alt="Chat on WhatsApp"
        width="56"
        height="56"
        loading="lazy"
        decoding="async"
        style={{ background: 'transparent', display: 'block' }}
      />
    </a>
  );
};

export default FloatingWhatsApp;