import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'money — Payment Skill for AI Agents',
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
      className={`${playfair.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-wordmark">money</a>
            <div className="nav-links">
              <a href="/merchant">Merchant Demo</a>
              <a href="/agent-flow">Agent Flow UI</a>
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
