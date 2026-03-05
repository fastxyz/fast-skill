'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LandingThreeBackground } from '../components/landing-three-background';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type WaitlistStatus = 'idle' | 'loading' | 'success' | 'error';

const IS_DEV = process.env.NODE_ENV === 'development';
const CAPTCHA_TIMEOUT_MS = 10000;

export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<WaitlistStatus>('idle');
  const [message, setMessage] = useState('Dummy waitlist input for now.');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(IS_DEV ? 'dev-bypass' : null);
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (IS_DEV) return;

    let renderAttempted = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const renderWidget = () => {
      if (
        renderAttempted ||
        !turnstileRef.current ||
        !window.turnstile ||
        widgetIdRef.current
      ) {
        return;
      }

      renderAttempted = true;

      try {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            setTurnstileToken(token);
            setCaptchaLoadFailed(false);
          },
          'expired-callback': () => {
            setTurnstileToken(null);
          },
          'error-callback': () => {
            setCaptchaLoadFailed(true);
            setMessage('Captcha failed to load. Please refresh and try again.');
          },
          theme: 'auto',
          size: 'flexible',
        });
      } catch {
        setCaptchaLoadFailed(true);
        setMessage('Captcha failed to load. Please refresh and try again.');
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      intervalId = setInterval(() => {
        if (window.turnstile || renderAttempted) {
          if (intervalId) clearInterval(intervalId);
          renderWidget();
        }
      }, 200);

      timeoutId = setTimeout(() => {
        if (!window.turnstile && !widgetIdRef.current) {
          setCaptchaLoadFailed(true);
          setMessage('Captcha is taking longer than usual. Please wait or refresh the page.');
        }
      }, CAPTCHA_TIMEOUT_MS);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setStatus('error');
      setMessage('Please enter an email address.');
      return;
    }

    if (!turnstileToken) {
      setStatus('error');
      setMessage(
        captchaLoadFailed
          ? 'Captcha has not loaded yet. Refresh and try again.'
          : 'Please complete the captcha first.',
      );
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: turnstileToken }),
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setMessage("You're on the list. We'll be in touch.");
      setEmail('');
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Network error. Please try again.');

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setTurnstileToken(null);
    }
  }

  return (
    <div className="landing-shell">
      <LandingThreeBackground />
      <main className="landing-main">
        <section className="section landing-install">
          <div className="container">
            <h2 className="landing-title">JOIN THE WAITLIST</h2>
            <form className="waitlist-block" onSubmit={handleSubmit}>
              <input
                type="email"
                className="waitlist-input"
                placeholder="your@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={status === 'loading'}
                required
              />
              <button type="submit" className="waitlist-btn" disabled={status === 'loading'}>
                {status === 'loading' ? 'Submitting...' : 'Join the waitlist'}
              </button>
            </form>
            <p className={`waitlist-note${status === 'error' ? ' is-error' : ''}${status === 'success' ? ' is-success' : ''}`}>
              {message}
            </p>
            {!IS_DEV && status !== 'success' ? (
              <div className="waitlist-captcha-wrap">
                <div ref={turnstileRef} />
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="footer landing-footer">
        <div className="container footer-inner">
          <span className="footer-credit">Fast.xyz</span>
          <nav className="footer-nav">
            <a href="/skill.md">Skill</a>
            <a href="/money.bundle.js" download>
              Bundle
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
