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

import {Plus_Jakarta_Sans, JetBrains_Mono} from 'next/font/google';

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
      className={`dark ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-[#0B0F17] text-slate-100 antialiased selection:bg-rose-500/30 selection:text-rose-200 overflow-hidden select-none font-sans"
      >
        {children}
      </body>
    </html>
  );
}
