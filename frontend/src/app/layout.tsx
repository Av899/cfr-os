import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Montserrat } from 'next/font/google';
import './globals.css';
import MenuActionHandler from '@/components/layout/MenuActionHandler';
import AuthGuard from '@/components/layout/AuthGuard';
import { HtmlLangSync } from '@/components/layout/HtmlLangSync';
import { ThemeSync } from '@/components/layout/ThemeSync';
import { NumberInputWheelGuard } from '@/components/layout/NumberInputWheelGuard';
import { DirectionalToaster } from '@/components/layout/DirectionalToaster';
import DesktopDragSurface from '@/components/layout/DesktopDragSurface';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { PostHogBootstrap } from '@/components/analytics/PostHogBootstrap';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Coffee First Ritual • CFR OS',
  description: 'Good Coffee. Better Days. • Specialty Coffee & Artisanal Eggless Bakery Operating System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CFR OS',
  },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1E1B16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* gh-513 FOUC guard: apply the last-resolved palette before first
            paint. Priority: ?theme= URL param (standalone windows opened by
            main with the current palette) → localStorage mirror → system
            matchMedia. try/catch: worst case is one light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=new URLSearchParams(location.search).get('theme');" +
              "var t=(p==='dark'||p==='light')?p:localStorage.getItem('flo-theme-resolved');" +
              "if(t==='dark'||(t!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)){" +
              "document.documentElement.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <Suspense fallback={null}>
          <PostHogBootstrap />
        </Suspense>
        <I18nProvider>
          <DesktopDragSurface />
          <MenuActionHandler />
          <HtmlLangSync />
          <ThemeSync />
          <NumberInputWheelGuard />
          <AuthGuard>{children}</AuthGuard>
          <DirectionalToaster />
        </I18nProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
