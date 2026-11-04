import React, { useEffect } from 'react';
import { PERSONA_CONTENT, SAMPLES } from '../concepts';

function SampleArt({ kind }) {
  if (kind === 'bars-warm') {
    return (
      <svg viewBox="0 0 200 60" style={{ width: '100%', height: '100%' }}>
        {[15, 28, 22, 38, 30, 48, 42, 55].map((h, i) => (
          <rect key={i} x={6 + i * 24} y={60 - h} width="16" height={h} rx="2" fill="#713b57" />
        ))}
      </svg>
    );
  }
  if (kind === 'line-up') {
    return (
      <svg viewBox="0 0 200 60" style={{ width: '100%', height: '100%' }}>
        <polyline
          points="0,52 28,40 56,46 84,30 112,38 140,20 168,28 200,8"
          stroke="#d25946"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M 0 52 L 28 40 L 56 46 L 84 30 L 112 38 L 140 20 L 168 28 L 200 8 L 200 60 L 0 60 Z"
          fill="rgba(210,89,70,0.15)"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 60" style={{ width: '100%', height: '100%' }}>
      {[
        [20, 30],
        [40, 18],
        [60, 42],
        [80, 25],
        [100, 38],
        [120, 15],
        [140, 30],
        [160, 22],
        [180, 45],
      ].map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#713b57" opacity={0.6} />
      ))}
    </svg>
  );
}

const DEFAULT_SAMPLE = 'ev-sales';

export default function Start({
  role,
  onConnectClick,
  onSamplePick,
  onStartEmpty,
  onTakeTour,
  fire,
  isLoadingSample,
  loadingText,
}) {
  useEffect(() => {
    fire('onboarding_data_seen');
  }, [fire]);
  const defaultSample = PERSONA_CONTENT[role]?.sample || DEFAULT_SAMPLE;

  return (
    <div className="onb-screen-inner onb-screen-enter">
      <h1 className="onb-role-h">Welcome to Visivo.</h1>
      <p className="onb-role-sub">
        Pick a sample to open a live dashboard now. Visivo writes the project into this folder and
        builds it, so you can edit everything after.
      </p>
      <div className="onb-sample-grid">
        {Object.values(SAMPLES).map(s => {
          const isDefault = s.name === defaultSample;
          return (
            <button
              key={s.name}
              className={`onb-sample-tile ${isDefault ? 'onb-sample-tile--default' : ''}`}
              disabled={isLoadingSample}
              onClick={() => {
                fire('onboarding_sample_picked', { sample_name: s.name });
                onSamplePick(s);
              }}
              data-testid={`onb-sample-${s.name}`}
            >
              {isDefault && <div className="onb-sample-tile__badge">Suggested</div>}
              <div className="onb-sample-tile__art">
                <SampleArt kind={s.art} />
              </div>
              <div className="onb-sample-tile__title">{s.title}</div>
              <div className="onb-sample-tile__desc">{s.desc}</div>
              <div className="onb-sample-tile__schema">{s.schema}</div>
            </button>
          );
        })}
      </div>
      {isLoadingSample && (
        <div className="onb-start-loading" role="status" data-testid="onb-sample-loading">
          <span className="onb-spin" />
          {loadingText || 'Building the sample…'}
        </div>
      )}
      <div className="onb-start-alt">
        <button
          className="onb-btn onb-btn--secondary"
          disabled={isLoadingSample}
          onClick={() => {
            fire('onboarding_data_connect_clicked');
            onConnectClick();
          }}
          data-testid="onb-data-connect"
        >
          Connect your own data
        </button>
        <button
          className="onb-text-link"
          disabled={isLoadingSample}
          onClick={onStartEmpty}
          data-testid="onb-start-empty"
        >
          Start with an empty project
        </button>
        <button
          className="onb-text-link"
          disabled={isLoadingSample}
          onClick={onTakeTour}
          data-testid="onb-start-tour"
        >
          New to Visivo? Take the concept tour
        </button>
      </div>
    </div>
  );
}
