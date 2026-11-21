import './globals.css';
import './styles/glass.css';
import { ReactNode } from 'react';
import MotionProvider from '@/components/ui/MotionProvider';
import { motionBootScript } from '@/components/ui/motion-boot';
import { Backdrop } from '@/components/ui';

export const metadata = {
  title: 'Marketivity Client Portal',
  description: 'Secure client portal for Marketivity campaigns.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
