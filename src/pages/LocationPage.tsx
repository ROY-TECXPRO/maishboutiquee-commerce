import CommutesMap from '@/components/CommutesMap';

// Security: the Google Maps key must come from the build environment, never from
// source. A key committed here is published to GitHub AND shipped in the public
// JS bundle, where anyone can scrape it and run up your Google Cloud bill.
//
// Create a *browser-restricted* key (Google Cloud > APIs & Services > Credentials):
//   - Application restrictions > HTTP referrers: https://maishfashionboutique.co.ke/*
//     plus the Netlify deploy-preview hosts you use
//   - API restrictions > only the Maps JavaScript API (plus Places/Geometry if used)
// Never use an unrestricted key here.
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

const LocationPage = () => {
  // Your store location (Maish Style Shop location in Kenya)
  const storeLocation = {
    lat: -1.0912005,
    lng: 35.871697,
  };

  // Without a key the map simply cannot load, so render the address instead
  // of a blank grey rectangle.
  const hasMapsKey = GOOGLE_MAPS_API_KEY.length > 0;

  if (!hasMapsKey && import.meta.env.DEV) {
    console.warn(
      '[LocationPage] VITE_GOOGLE_MAPS_API_KEY is not set - the map is ' +
        'hidden and a link to Google Maps is shown instead.',
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Find Our Location</h1>
        <p className="mb-6 text-gray-600">
          Use the map below to estimate your commute time to our store. 
          You can add destinations and see travel times by driving, transit, bicycling, or walking.
        </p>
        
        {hasMapsKey ? (
          <div className="h-[600px] rounded-lg overflow-hidden shadow-lg">
            <CommutesMap
              apiKey={GOOGLE_MAPS_API_KEY}
              center={storeLocation}
              zoom={14}
              defaultTravelMode="WALKING"
              distanceMeasurementType="METRIC"
            />
          </div>
        ) : (
          <div className="h-[600px] rounded-lg overflow-hidden shadow-lg bg-white flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-xl font-semibold mb-2 text-gray-900">
              Our store is in Narok, Kenya
            </h2>
            <p className="text-gray-600 mb-4">
              The interactive map could not be loaded. Open our location in
              Google Maps instead:
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${storeLocation.lat},${storeLocation.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              Open in Google Maps
            </a>
          </div>
        )}

        <div className="mt-6 p-4 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Visit Our Store</h2>
          <p className="text-gray-600">
            We're located in Kenya/Narok and offer a wide range of fashion items including suits, 
            casual wear, uniforms, and more. Come visit us for a personalized shopping experience!
          </p>
        </div>
      </div>
    </div>
  );
};

export default LocationPage;
