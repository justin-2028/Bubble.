export const metadata = {
  title: 'Bubble.',
  description: 'Google Sheets and CRMs suck.',
  icons: {
    icon: '/icon.png'
  }
};

import './globals.css';
import { Providers } from '../components/Providers';
import React from 'react';
import { DesktopOnlyGate } from '../components/ui/DesktopOnlyGate';
import { DM_Sans, Fragment_Mono } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fragment-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fragmentMono.variable} font-body`}>
        <Providers>
          {children}
          <DesktopOnlyGate minWidthPx={1024} />
        </Providers>
      </body>
    </html>
  );
}
