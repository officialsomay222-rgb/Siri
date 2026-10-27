import type {Metadata, Viewport} from 'next';
import './globals.css';
import {Plus_Jakarta_Sans, JetBrains_Mono} from 'next/font/google';

export const metadata: Metadata = {
  title: 'Airi & Silas 3D — VRM AI Avatar Companion',
  description:
    'High-performance 3D VRM talking anime AI companion with real-time voice recognition, Gemini conversational intelligence, frequency-driven lip sync, and low-end mobile optimization.',
  applicationName: 'Airi 3D',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Airi 3D',
  },
  icons: {
    icon: [
      {url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png'},
      {url: '/icon.svg', sizes: 'any', type: 'image/svg+xml'},
      {url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png'},
    ],
    apple: [
      {url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png'},
    ],
  },
  openGraph: {
    title: 'Airi & Silas 3D — VRM AI Avatar Companion',
    description:
      'High-performance 3D VRM talking anime AI companion with real-time voice recognition, Gemini conversational intelligence, and frequency-driven lip sync.',
    type: 'website',
    images: [{url: '/pwa-512x512.png', width: 512, height: 512, alt: 'Airi 3D Avatar'}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airi & Silas 3D — VRM AI Avatar Companion',
    description:
      'High-performance 3D VRM talking anime AI companion with real-time voice recognition and Gemini intelligence.',
    images: ['/pwa-512x512.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B0F17',
};

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0B0F17" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        suppressHydrationWarning
        className="bg-[#0B0F17] text-slate-100 antialiased selection:bg-rose-500/30 selection:text-rose-200 overflow-hidden select-none font-sans"
      >
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
