import React, { useEffect } from 'react';

export default function Handoff({ destination, totalDurationMs, sourceConnected, cloudConnected, fire }) {
  useEffect(() => {
    fire('onboarding_completed', {
      path: sourceConnected ? 'data' : 'sample',
      total_duration_ms: totalDurationMs,
      source_connected: sourceConnected,
      cloud_connected: cloudConnected,
    });
    fire('onboarding_checklist_shown');
  }, [fire, sourceConnected, cloudConnected, totalDurationMs]);

  return (
    <div className="onb-screen-inner onb-screen-enter">
      <div className="onb-handoff">
        <div className="onb-handoff__icon">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="onb-handoff__h">You're set up.</h2>
        <p className="onb-handoff__sub">
          Taking you to{' '}
          <code
            style={{
              background: 'var(--onb-bg-muted)',
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'var(--onb-mono)',
              fontSize: 13,
            }}
          >
            {destination}
          </code>
          . A small checklist will follow you in the top-right of the viewer to keep momentum.
        </p>
        <div className="onb-handoff__loading">
          <span className="onb-spin" /> Loading viewer…
        </div>
      </div>
    </div>
  );
}
