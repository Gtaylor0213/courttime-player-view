import { useEffect } from 'react';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectDevicePlatform,
  storeUrlFor,
} from '../../shared/utils/appDownload';
import logoImage from '../assets/courttime-logo.png';

/**
 * Landing page for the /get-app smart link. The server already redirects
 * phones it recognises; this catches desktops and iPads that report a Mac
 * user agent (only the browser can tell those apart).
 */
export function GetAppPage() {
  useEffect(() => {
    const storeUrl = storeUrlFor(detectDevicePlatform(navigator.userAgent, navigator.maxTouchPoints));
    if (storeUrl) window.location.replace(storeUrl);
  }, []);

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 text-center shadow-sm">
        <img src={logoImage} alt="CourtTime" className="mx-auto h-10 w-auto" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Get the CourtTime app</h1>
        <p className="mt-2 text-sm text-gray-600">
          Scan this code with your phone’s camera to download CourtTime for iPhone or Android.
        </p>
        <img src="/get-app-qr.svg" alt="QR code linking to the CourtTime app" className="mx-auto mt-5 h-44 w-44" />
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a href={APP_STORE_URL}>
            <img src="/badges/app-store.png" alt="Download on the App Store" width={144} height={48} className="h-12 w-auto" />
          </a>
          <a href={PLAY_STORE_URL}>
            <img src="/badges/google-play.png" alt="Get it on Google Play" width={161} height={48} className="h-12 w-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}
