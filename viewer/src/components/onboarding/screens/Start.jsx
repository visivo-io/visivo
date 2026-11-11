import React, { useEffect, useRef, useState } from 'react';
import { PERSONA_CONTENT, SAMPLES } from '../concepts';

const ICONS = {
  example: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 16v-4m5 4V7m5 9v-6" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <span className="onb-door__icon">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONS[name]}
      </svg>
    </span>
  );
}

function SampleArt({ kind }) {
  if (kind === 'bars-warm') {
    return (
      <svg viewBox="0 0 100 60" aria-hidden="true">
        {[16, 25, 22, 34, 30, 44, 40, 51].map((h, i) => (
          <rect key={i} x={6 + i * 11} y={56 - h} width="7" height={h} rx="1.5" fill="#713b57" />
        ))}
      </svg>
    );
  }
  if (kind === 'line-up') {
    return (
      <svg viewBox="0 0 100 60" aria-hidden="true">
        <polyline
          points="6,50 20,40 32,44 46,30 58,36 72,19 84,25 96,9"
          fill="none"
          stroke="#d25946"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 60" aria-hidden="true">
      {[18, 40, 26, 15, 35, 21, 41, 30, 12].map((y, i) => (
        <circle key={i} cx={8 + i * 10} cy={y} r="2.8" fill="#713b57" opacity={0.6} />
      ))}
    </svg>
  );
}

const DEFAULT_SAMPLE = 'ev-sales';

function PathCard({
  id,
  title,
  lines,
  openPath,
  onOpen,
  disabled,
  panelTitle,
  footnote,
  children,
}) {
  const isOpen = openPath === id;
  const headingRef = useRef(null);

  useEffect(() => {
    if (isOpen) headingRef.current?.focus();
  }, [isOpen]);

  return (
    <section className={`onb-door__card ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="onb-door__choice"
        aria-expanded={isOpen}
        aria-controls={`onb-door-${id}`}
        disabled={disabled}
        onClick={() => onOpen(id)}
        data-testid={`onb-path-${id}`}
      >
        <Icon name={id} />
        <span className="onb-door__text">
          <span className="onb-door__title">{title}</span>
          {lines.map(line => (
            <span key={line} className="onb-door__desc">
              {line}
            </span>
          ))}
        </span>
        <span className="onb-door__arrow" aria-hidden="true">
          ↗
        </span>
      </button>
      {isOpen && (
        <div id={`onb-door-${id}`} className="onb-door__panel">
          <h2 className="onb-door__label" tabIndex={-1} ref={headingRef}>
            {panelTitle}
          </h2>
          {children}
          <p className="onb-door__footnote">{footnote}</p>
        </div>
      )}
    </section>
  );
}

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
  const [openPath, setOpenPath] = useState(null);

  useEffect(() => {
    fire('onboarding_data_seen');
  }, [fire]);
  const defaultSample = PERSONA_CONTENT[role]?.sample || DEFAULT_SAMPLE;

  return (
    <div className="onb-screen-inner onb-screen-enter onb-start">
      <div className="onb-start__intro">
        <div className="onb-start__eyebrow">Your first project</div>
        <h1 className="onb-start__h">Start with something to explore.</h1>
        <p className="onb-start__sub">Try an example, or bring data you already know.</p>
      </div>
      <div className={`onb-door ${openPath ? `onb-door--${openPath}` : ''}`}>
        <PathCard
          id="example"
          title="Example"
          lines={['A ready-to-explore project.', 'See what you can build.']}
          panelTitle="Pick an example"
          footnote="A complete project you can edit and make your own."
          openPath={openPath}
          onOpen={setOpenPath}
          disabled={isLoadingSample}
        >
          {Object.values(SAMPLES).map(s => (
            <button
              key={s.name}
              type="button"
              className="onb-door__sample"
              disabled={isLoadingSample}
              onClick={() => {
                fire('onboarding_sample_picked', { sample_name: s.name });
                onSamplePick(s);
              }}
              data-testid={`onb-sample-${s.name}`}
            >
              <span className="onb-door__art">
                <SampleArt kind={s.art} />
              </span>
              <span className="onb-door__sample-text">
                <span className="onb-door__sample-title">
                  {s.title}
                  {s.name === defaultSample && <span className="onb-door__badge">Suggested</span>}
                </span>
                <span className="onb-door__sample-desc">{s.desc}</span>
                <span className="onb-door__meta">{s.schema}</span>
              </span>
              <span className="onb-door__go" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </PathCard>
        <PathCard
          id="data"
          title="Your data"
          lines={['Your files. Your databases.', 'Your next answer.']}
          panelTitle="How would you like to add data?"
          footnote="Start with one source. You can always add more."
          openPath={openPath}
          onOpen={setOpenPath}
          disabled={isLoadingSample}
        >
          <div className="onb-door__options">
            <button
              type="button"
              className="onb-door__option"
              disabled={isLoadingSample}
              onClick={() => {
                fire('onboarding_data_connect_clicked');
                onConnectClick();
              }}
              data-testid="onb-data-connect"
            >
              <Icon name="data" />
              <span className="onb-door__option-title">Connect a data source</span>
              <span className="onb-door__option-desc">
                Connect directly to a database or warehouse.
              </span>
              <span className="onb-door__option-foot">Choose a source →</span>
            </button>
          </div>
        </PathCard>
      </div>
      {isLoadingSample && (
        <div className="onb-start-loading" role="status" data-testid="onb-sample-loading">
          <span className="onb-spin" />
          {loadingText || 'Building the sample…'}
        </div>
      )}
      <div className="onb-start-alt">
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
          Take a quick tour
        </button>
      </div>
    </div>
  );
}
