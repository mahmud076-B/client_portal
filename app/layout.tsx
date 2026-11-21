import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Marketivity Client Portal',
  description: 'Secure client portal for Marketivity campaigns.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F7F3F0',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
