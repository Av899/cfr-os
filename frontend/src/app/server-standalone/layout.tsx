import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import '../globals.css';
import { DirectionalToaster } from '@/components/layout/DirectionalToaster';
import { KdsHtmlLang } from '@/components/kds/KdsHtmlLang';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Flo Server App',
  description: 'Tableside ordering for FloCafe',
};

export default function ServerStandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark h-full">
      <body className={`${montserrat.variable} font-sans h-full bg-background text-foreground`}>
        <KdsHtmlLang />
        <DirectionalToaster />
        {children}
      </body>
    </html>
  );
}
