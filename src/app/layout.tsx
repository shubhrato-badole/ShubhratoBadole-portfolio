import type { Metadata } from 'next';
import './globals.css';

import WorkGlProvider from '../components/work/GlProvider';

import {
  Instrument_Serif,
  IBM_Plex_Mono,
  Instrument_Sans,
} from 'next/font/google';

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-wk-serif',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: '500',
  variable: '--font-wk-mono',
});

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-wk-sans',
});

export const metadata: Metadata = {
  title: 'Shubhrato — AI engineer',
  description:
    'AI engineer. I build full-stack systems and think about how they break.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${mono.variable} ${sans.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Anybody:wdth,wght@50..150,100..900&family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Mrs+Saint+Delafield&display=swap"
          rel="stylesheet"
        />
      </head>

      <body>
        <WorkGlProvider>
          {children}
        </WorkGlProvider>
      </body>
    </html>
  );
}