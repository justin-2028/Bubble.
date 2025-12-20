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
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DesktopOnlyGate } from '../components/ui/DesktopOnlyGate';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Fragment+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body">
        <Providers>
          {children}
          <Analytics />
          <DesktopOnlyGate minWidthPx={1024} />
        </Providers>
      </body>
    </html>
  );
}
