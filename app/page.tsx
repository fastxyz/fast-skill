import { CopyButton } from './copy-button';
import { LandingThreeBackground } from './components/landing-three-background';

export default function Home() {
  return (
    <div className="landing-shell">
      <LandingThreeBackground />
      <main className="landing-main">
        <section id="install" className="section landing-install">
          <div className="container">
            <h2 className="landing-title">THE PAYMENT SKILL FOR AI AGENTS</h2>
            <div className="install-block">
              <div className="install-text">
                <code className="install-cmd">
                  npx skills add Pi-Squared-Inc/fast-api
                </code>
              </div>
              <CopyButton text="npx skills add Pi-Squared-Inc/fast-api" />
            </div>
            <span className="install-hint">
              one command, that&apos;s it
            </span>
          </div>
        </section>
      </main>

      <a href="/receive" className="landing-next-link">
        <span className="landing-next-label">Next</span>
        <span className="landing-next-title">
          Getting Started <span aria-hidden="true">→</span>
        </span>
      </a>

      <footer className="footer landing-footer">
        <div className="container footer-inner">
          <span className="footer-credit">Fast.xyz</span>
          <nav className="footer-nav">
            <a href="/skill.md">Skill</a>
            <a href="/receive">Receive</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
