import React, { useEffect, useState } from 'react';
import { PERSONA_CONTENT } from '../concepts';

export default function Cloud({ role, connected, onConnect, onLater, onConnectedDone, fire }) {
  useEffect(() => {
    fire('onboarding_cloud_seen');
  }, [fire]);
  const persona = PERSONA_CONTENT[role] || PERSONA_CONTENT.other;
  const [authState, setAuthState] = useState(connected ? 'done' : 'idle');

  return (
    <div className="onb-screen-inner onb-screen-enter">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="onb-welcome-eyebrow" style={{ margin: 0 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: 'var(--color-primary-500)',
            }}
          />
          Optional
        </span>
        {authState === 'done' && (
          <span className="onb-cloud-connected-badge">✓ Connected to cloud</span>
        )}
      </div>
      <h2 className="onb-cloud-h">Local for you. Cloud for the team.</h2>
      <p
        style={{
          fontSize: 15,
          color: 'var(--onb-fg-secondary)',
          lineHeight: 1.55,
          margin: '0 0 22px',
          maxWidth: 720,
        }}
      >
        Visivo has been open source since 2021 — the CLI you're running is the same engine
        that's powered our hosted product for years. Cloud is the team layer; everything you
        build locally runs there too.
      </p>

      <div className="onb-cloud-flow">
        <div className="onb-cloud-flow__node">
          <div
            className="onb-cloud-flow__icon"
            style={{ color: '#4f494c', borderColor: '#dbdadb' }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="13" rx="2" />
              <path d="M8 21h8M12 18v3" />
            </svg>
          </div>
          <div className="onb-cloud-flow__label">Your machine</div>
          <div className="onb-cloud-flow__sub">Author · iterate · commit</div>
        </div>
        <div className="onb-cloud-flow__arrow">
          <span className="onb-cloud-flow__cmd">
            <span className="onb-cloud-flow__cmd-prompt">$</span> visivo deploy
          </span>
          <svg
            className="onb-cloud-flow__arrow-line"
            viewBox="0 0 36 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="onb-cf-grad-1" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#a9899a" />
                <stop offset="100%" stopColor="#713b57" />
              </linearGradient>
            </defs>
            <path
              d="M0 5 H30"
              stroke="url(#onb-cf-grad-1)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M27 1.5 L34 5 L27 8.5"
              stroke="#713b57"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="onb-cloud-flow__node">
          <div className="onb-cloud-flow__icon onb-cloud-flow__icon--cloud">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 10h-1a5 5 0 0 0-9.6-1.5A4 4 0 0 0 7 16h11a3 3 0 0 0 0-6z" />
            </svg>
          </div>
          <div className="onb-cloud-flow__label">Visivo Cloud</div>
          <div className="onb-cloud-flow__sub">Schedule · share · review</div>
        </div>
        <div className="onb-cloud-flow__arrow">
          <span className="onb-cloud-flow__cmd onb-cloud-flow__cmd--soft">shared link</span>
          <svg
            className="onb-cloud-flow__arrow-line"
            viewBox="0 0 36 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="onb-cf-grad-2" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#713b57" />
                <stop offset="100%" stopColor="#726d6f" />
              </linearGradient>
            </defs>
            <path
              d="M0 5 H30"
              stroke="url(#onb-cf-grad-2)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M27 1.5 L34 5 L27 8.5"
              stroke="#726d6f"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="onb-cloud-flow__node">
          <div
            className="onb-cloud-flow__icon"
            style={{ color: '#3f3a3c', borderColor: '#d1d5db' }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="9" r="3" />
              <circle cx="17" cy="10" r="2.5" />
              <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4.5-3.5s3.5 1 3.5 3" />
            </svg>
          </div>
          <div className="onb-cloud-flow__label">Your team</div>
          <div className="onb-cloud-flow__sub">Read · comment · react</div>
        </div>
      </div>

      <div className="onb-cloud-compare">
        <div className="onb-cloud-col">
          <div className="onb-cloud-col__label">Local — free, forever</div>
          <ul className="onb-cloud-col__list">
            <li>
              Author with hot-reload (<code style={{ fontSize: 12 }}>visivo serve</code>)
            </li>
            <li>Git-native — diff, review, revert</li>
            <li>Data stays on your machine</li>
            <li>Deploy anywhere (Docker, Vercel, your infra)</li>
          </ul>
        </div>
        <div className="onb-cloud-col onb-cloud-col--cloud">
          <div className="onb-cloud-col__label">Cloud adds</div>
          <ul className="onb-cloud-col__list">
            <li>
              One-command deploys (<code style={{ fontSize: 12 }}>visivo deploy</code>)
            </li>
            <li>Scheduled refreshes &amp; shared sources</li>
            <li>Auth, roles, per-dashboard sharing</li>
            <li>Stage previews on every PR — CI for BI</li>
          </ul>
        </div>
      </div>

      <div className="onb-cloud-persona">
        <span className="onb-cloud-persona__h">For you:</span> {persona.cloud_framing}
      </div>

      <div className="onb-actions">
        <div className="onb-actions__hint">
          No payment, no credit card. Free tier covers solo use.
        </div>
        <div className="onb-actions__right">
          <button
            className="onb-btn onb-btn--ghost"
            onClick={() => {
              fire('onboarding_cloud_skipped');
              onLater();
            }}
            data-testid="onb-cloud-later"
          >
            Maybe later
          </button>
          {authState === 'idle' && (
            <button
              className="onb-btn onb-btn--primary"
              data-testid="onb-cloud-signup"
              onClick={() => {
                fire('onboarding_cloud_auth_clicked');
                window.open('https://app.visivo.io/register', '_blank', 'noopener');
                setAuthState('pending');
                setTimeout(() => {
                  setAuthState('done');
                  fire('onboarding_cloud_auth_completed', { ms_to_complete: 1800 });
                  onConnect();
                }, 1500);
              }}
            >
              Sign up for free cloud →
            </button>
          )}
          {authState === 'pending' && (
            <button className="onb-btn onb-btn--primary" disabled>
              <span
                className="onb-spin"
                style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
              />
              Opening signup tab…
            </button>
          )}
          {authState === 'done' && (
            <button
              className="onb-btn onb-btn--primary"
              data-testid="onb-cloud-finish"
              onClick={onConnectedDone}
            >
              Continue → finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
