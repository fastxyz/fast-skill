import { headers } from 'next/headers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CopyButton } from './copy-button';

const chains = [
  { name: 'Fast', token: 'SET', format: 'fast1...' },
  { name: 'Base', token: 'ETH', format: '0x...' },
  { name: 'Ethereum', token: 'ETH', format: '0x...' },
  { name: 'Arbitrum', token: 'ETH', format: '0x...' },
  { name: 'Polygon', token: 'POL', format: '0x...' },
  { name: 'Optimism', token: 'ETH', format: '0x...' },
  { name: 'BSC', token: 'BNB', format: '0x...' },
  { name: 'Avalanche', token: 'AVAX', format: '0x...' },
  { name: 'Fantom', token: 'FTM', format: '0x...' },
  { name: 'zkSync', token: 'ETH', format: '0x...' },
  { name: 'Linea', token: 'ETH', format: '0x...' },
  { name: 'Scroll', token: 'ETH', format: '0x...' },
  { name: 'Solana', token: 'SOL', format: 'base58' },
];

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const version = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version;

  return (
    <>
      <main>
        <section className="hero">
          <div className="container">
            <p className="hero-label">Payment Skill for AI Agents</p>
            <h1 className="hero-title">
              <img src="/fast-wordmark.svg" alt="FAST" className="hero-logo" />
              {' '}API
            </h1>
          </div>
        </section>

        <div className="divider">
          <span />
        </div>

        <section id="install" className="section">
          <div className="container">
            <h2 className="section-label">Install</h2>
            <div className="install-block">
              <div className="install-text">
                <code className="install-cmd">
                  npx skills add Pi-Squared-Inc/fast-api
                </code>
                <span className="install-hint">
                  one command, that&apos;s it
                </span>
              </div>
              <CopyButton text="npx skills add Pi-Squared-Inc/fast-api" />
            </div>
            <p className="section-note">v{version}. Two files. No dependencies.</p>
          </div>
        </section>

        <div className="divider">
          <span />
        </div>

        <section className="section">
          <div className="container">
            <h2 className="section-label">Chains</h2>
            <div className="table-wrap">
              <table className="chain-table">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>Token</th>
                    <th>Address</th>
                    <th>Networks</th>
                  </tr>
                </thead>
                <tbody>
                  {chains.map((c) => (
                    <tr key={c.name}>
                      <td className="chain-name-cell">{c.name}</td>
                      <td>
                        <code>{c.token}</code>
                      </td>
                      <td>
                        <code>{c.format}</code>
                      </td>
                      <td>
                        <span className="net">testnet</span>
                        <span className="net">mainnet</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-credit">Fast Protocol</span>
          <nav className="footer-nav">
            <a href="/skill.md">Skill</a>
            <a href="/money.bundle.js" download>
              Bundle
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
