'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SDK_LINKS = [
  { href: '/receive', label: 'Receive' },
  { href: '/send', label: 'Send' },
  { href: '/sign', label: 'Sign' },
  { href: '/tokens', label: 'Tokens' },
] as const;

const SIDEBAR_ROUTE_PREFIXES = [
  '/receive',
  '/send',
  '/pay',
  '/sign',
  '/tokens',
] as const;

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function shouldShowSidebar(pathname: string): boolean {
  return SIDEBAR_ROUTE_PREFIXES.some((prefix) => pathMatches(pathname, prefix));
}

export function DemoSidebarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

  if (!shouldShowSidebar(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="demo-shell">
      <aside className="demo-sidebar" aria-label="Demo navigation">
        <div className="demo-sidebar-group">
          <p className="demo-sidebar-label">FAST SDK</p>
          <nav className="demo-sidebar-nav">
            {SDK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`demo-sidebar-link${pathMatches(pathname, link.href) ? ' is-active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="demo-shell-content">{children}</div>
    </div>
  );
}
