import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${jetbrains.variable}`}
    >
      <body className="antialiased">
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-wordmark">
              <img src="/fast-wordmark.svg" alt="FAST" className="nav-logo" />
              <span>API</span>
            </a>
            <div className="nav-links">
              <a href="/merchant">Merchant Demo</a>
              <a href="/paywall">Paywall Studio</a>
              <a href="/payment-links">Payment Links</a>
              <a href="/swap">Swap Terminal</a>
              <a href="/bridge">Bridge Console</a>
              <a href="/sign">Signature Lab</a>
              <details className="nav-dropdown">
                <summary>Tools</summary>
                <div className="nav-dropdown-menu">
                  <a href="/providers">Providers</a>
                  <a href="/tokens">Tokens</a>
                  <a href="/utils">Utilities</a>
                  <a href="/errors">Errors</a>
                </div>
              </details>
              <a href="/pay">Pay</a>
              <a href="/skill.md">Skill</a>
              <a href="/money.bundle.js" download>Bundle</a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
