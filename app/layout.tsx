import type {Metadata, Viewport} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Airi 3D — VRM AI Avatar Companion',
  description:
    'High-performance 3D VRM talking girl AI companion with real-time voice recognition, Gemini conversational intelligence, frequency-driven lip sync, and low-end mobile optimization.',
  openGraph: {
    title: 'Airi 3D — VRM AI Avatar Companion',
    description:
      'High-performance 3D VRM talking girl AI companion with real-time voice recognition, Gemini conversational intelligence, frequency-driven lip sync, and low-end mobile optimization.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airi 3D — VRM AI Avatar Companion',
    description:
      'High-performance 3D VRM talking girl AI companion with real-time voice recognition, Gemini conversational intelligence, frequency-driven lip sync, and low-end mobile optimization.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B0F17',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-[#0B0F17] text-slate-100 antialiased selection:bg-rose-500/30 selection:text-rose-200 overflow-hidden select-none"
      >
        {children}
      </body>
    </html>
  );
}
