import React, { useEffect } from 'react';
import { WelcomeVisual } from '../ConceptVisuals';

export default function Welcome({ onContinue, onSkip, fire }) {
  useEffect(() => {
    fire('onboarding_welcome_seen');
  }, [fire]);
  return (
    <div className="onb-screen-inner onb-welcome onb-screen-enter">
      <div>
        <span className="onb-welcome-eyebrow">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: 'var(--color-primary-500)',
            }}
          />
          BI as code, running locally
        </span>
        <h1 className="onb-welcome-h1">Welcome to Visivo.</h1>
        <p className="onb-welcome-sub">
          Let's get started! You will leave this 2 minute flow with a working dashboard.
        </p>
        <div className="onb-welcome-cta-row">
          <button className="onb-btn onb-btn--primary" onClick={onContinue} data-testid="onb-welcome-continue">
            Continue <span style={{ opacity: 0.7 }}>→</span>
          </button>
          <button className="onb-text-link" onClick={onSkip} data-testid="onb-welcome-skip">
            Skip onboarding and go straight to the editor
          </button>
        </div>
        <div className="onb-welcome-meta">
          <span className="onb-welcome-meta__item">
            <span className="onb-welcome-meta__dot" />
            Build visually or in code
          </span>
          <span className="onb-welcome-meta__item">
            <span className="onb-welcome-meta__dot" />
            Your data stays local
          </span>
          <span className="onb-welcome-meta__item">
            <span className="onb-welcome-meta__dot" />
            ~2 minutes
          </span>
        </div>
      </div>
      <WelcomeVisual />
    </div>
  );
}
