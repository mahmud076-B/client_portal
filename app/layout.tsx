import './globals.css';
import './styles/glass.css';
import { ReactNode } from 'react';
import MotionProvider from '@/components/ui/MotionProvider';
import { motionBootScript } from '@/components/ui/motion-boot';
import { Backdrop } from '@/components/ui';
import { poppins } from '@/components/brand/fonts';

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
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionBootScript }} />
      </head>
      <body className="gx">
        <Backdrop />
        {children}
        <MotionProvider />
      </body>
    </html>
  );
}
