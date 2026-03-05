import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { DemoSidebarShell } from './components/demo-sidebar-shell';
import { ThemeToggle } from './components/theme-toggle';
import './globals.css';

const generalSans = localFont({
  src: [
    { path: '../public/fonts/GeneralSans-Light.otf', weight: '300' },
    { path: '../public/fonts/GeneralSans-Regular.otf', weight: '400' },
    { path: '../public/fonts/GeneralSans-Medium.otf', weight: '500' },
    { path: '../public/fonts/GeneralSans-Semibold.otf', weight: '600' },
  ],
  variable: '--font-general-sans',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FastAPI — Payment Skill for AI Agents',
  description:
    'Send, swap, bridge, and look up prices across 13 chains. RPCs, token addresses, and explorer URLs built in.',
};

const THEME_INIT_SCRIPT = `
(() => {
  try {
    const key = 'money-theme-preference';
    const root = document.documentElement;
    const stored = window.localStorage.getItem(key);
    const preference = stored === 'light' || stored === 'dark' ? stored : 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
    root.dataset.themePreference = preference;
    root.dataset.theme = resolved;
  } catch {
    // No-op if storage is unavailable.
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-wordmark">
              <img src="/fast-wordmark.svg" alt="FAST" className="nav-logo" />
              <span>API</span>
            </a>
            <div className="nav-actions">
              <div className="nav-links">
                <a href="/merchant">Docs</a>
                <a href="/waitlist">Waitlist</a>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </nav>
        <DemoSidebarShell>{children}</DemoSidebarShell>
      </body>
    </html>
  );
}
