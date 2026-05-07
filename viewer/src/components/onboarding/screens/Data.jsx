import React, { useEffect, useState } from 'react';
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

export default function Data({
  role,
  onConnectClick,
  onSamplePick,
  fire,
  isLoadingSample,
  loadingText,
}) {
  useEffect(() => {
    fire('onboarding_data_seen');
  }, [fire]);
  const [showSamples, setShowSamples] = useState(false);
  const persona = PERSONA_CONTENT[role] || PERSONA_CONTENT.other;
  const defaultSample = persona.sample;

  if (showSamples) {
    return (
      <div className="onb-screen-inner onb-screen-enter">
        <h2 className="onb-role-h">Pick a sample to start with.</h2>
        <p className="onb-role-sub">
          Each one is a fully built Visivo project — sources, models, insights, inputs, and a
          dashboard. You can edit anything.
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
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    color: 'var(--onb-fg-muted)',
                    fontFamily: 'var(--onb-mono)',
                  }}
                >
                  {s.schema}
                </div>
              </button>
            );
          })}
        </div>
        {isLoadingSample && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--onb-fg-muted)',
              marginTop: 8,
            }}
          >
            <span className="onb-spin" style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {loadingText || 'Importing sample…'}
          </div>
        )}
        <div className="onb-actions">
          <button
            className="onb-btn onb-btn--ghost"
            onClick={() => setShowSamples(false)}
            disabled={isLoadingSample}
          >
            ← Back to data step
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onb-screen-inner onb-screen-enter">
      <h2 className="onb-role-h">Now let's get some data in.</h2>
      <p className="onb-role-sub">Connect your own data, or start with a sample project</p>
      <div className="onb-data-grid">
        <button
          className="onb-data-card"
          onClick={() => {
            fire('onboarding_data_connect_clicked');
            onConnectClick();
          }}
          data-testid="onb-data-connect"
        >
          <div className="onb-data-card__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
              <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
            </svg>
          </div>
          <h3 className="onb-data-card__title">Connect your data</h3>
          <p className="onb-data-card__desc">
            Point at a database, warehouse, or upload a file. Credentials stay on your machine.
          </p>
          <div className="onb-data-card__list">
            <span className="onb-data-card__pill onb-data-card__pill--featured">Postgres</span>
            <span className="onb-data-card__pill onb-data-card__pill--featured">Snowflake</span>
            <span className="onb-data-card__pill">BigQuery</span>
            <span className="onb-data-card__pill">DuckDB</span>
            <span className="onb-data-card__pill">MySQL</span>
            <span className="onb-data-card__pill">+ 12 more</span>
          </div>
        </button>
        <button
          className="onb-data-card"
          onClick={() => setShowSamples(true)}
          data-testid="onb-data-sample"
        >
          <div
            className="onb-data-card__icon"
            style={{ background: '#f6f6f6', color: '#3f3a3c' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3h7v7H3z" />
              <path d="M14 3h7v7h-7z" />
              <path d="M14 14h7v7h-7z" />
              <path d="M3 14h7v7H3z" />
            </svg>
          </div>
          <h3 className="onb-data-card__title">Use a sample for now</h3>
          <p className="onb-data-card__desc">
            Three pre-built projects you can edit. Best when you want to learn the shape of Visivo
            before pointing it at production.
          </p>
          <div className="onb-data-card__list">
            {Object.values(SAMPLES).map(s => (
              <span
                key={s.name}
                className={`onb-data-card__pill ${
                  s.name === defaultSample ? 'onb-data-card__pill--featured' : ''
                }`}
              >
                {s.title}
              </span>
            ))}
          </div>
        </button>
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 22,
          fontSize: 12,
          color: 'var(--onb-fg-muted)',
        }}
      >
        You can connect more sources later. None of this is locked in.
      </div>
    </div>
  );
}
