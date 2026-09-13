import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Marketivity Client Portal',
  description: 'Secure client portal for Marketivity campaigns.',
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
