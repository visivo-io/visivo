import React, { useEffect } from 'react';
import { ROLES } from '../concepts';

export default function Role({ role, onPick, onContinue, fire }) {
  useEffect(() => {
    fire('onboarding_role_seen');
  }, [fire]);

  return (
    <div className="onb-screen-inner onb-screen-enter">
      <h2 className="onb-role-h">What's your role?</h2>
      <p className="onb-role-sub">
        We'll tailor the examples and the post-flow checklist. You can change this later in
        settings.
      </p>
      <div className="onb-role-grid" data-testid="onb-role-grid">
        {ROLES.map(r => (
          <button
            key={r.id}
            className={`onb-role-tile ${role === r.id ? 'onb-role-tile--active' : ''}`}
            onClick={() => {
              onPick(r.id);
              fire('onboarding_role_chosen', { role: r.id });
            }}
            data-testid={`onb-role-${r.id}`}
            aria-pressed={role === r.id}
          >
            <div className="onb-role-tile__icon">{r.icon}</div>
            <div style={{ flex: 1 }}>
              <div className="onb-role-tile__title">{r.label}</div>
              <div className="onb-role-tile__desc">{r.desc}</div>
            </div>
            <div className="onb-role-tile__check">{role === r.id ? '✓' : ''}</div>
          </button>
        ))}
      </div>
      <div className="onb-actions">
        <div className="onb-actions__hint">Required to personalize the rest of the flow.</div>
        <div className="onb-actions__right">
          <button
            className="onb-btn onb-btn--primary"
            disabled={!role}
            onClick={onContinue}
            data-testid="onb-role-continue"
          >
            Continue <span style={{ opacity: 0.7 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
