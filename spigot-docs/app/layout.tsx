import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import './global.css';
import './spigot.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Spigot — the metered stablecoin tap for AI agents',
    template: '%s | Spigot',
  },
  description:
    'Turn any API into a pay-per-call service. Agents pay instantly, in any stablecoin, with zero human in the loop. Built on Tempo.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.className} suppressHydrationWarning>
        <body className="min-h-screen bg-[var(--color-bg-page)] text-[var(--color-text-primary)] antialiased">
          <RootProvider theme={{ defaultTheme: 'light' }}>
            <div className="flex min-h-screen flex-col">
              <Nav />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </RootProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
