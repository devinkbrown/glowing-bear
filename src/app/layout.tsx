import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DarkBear',
  description: 'WeeChat Relay Web Client',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DarkBear',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta httpEquiv="cache-control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="pragma" content="no-cache" />
        <meta httpEquiv="expires" content="0" />
        {/* Sync script to prevent FOUC — reads theme from localStorage before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('darkbear_settings_v2');if(s){var d=JSON.parse(s);if(d.theme)document.documentElement.setAttribute('data-theme',d.theme)}else{var v1=localStorage.getItem('darkbear_settings_v1');if(v1){var d1=JSON.parse(v1);if(d1.theme){var t=d1.theme==='midnight'?'darkbear':d1.theme;document.documentElement.setAttribute('data-theme',t)}}}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-gray-950 text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
