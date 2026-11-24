import React from 'react';

/** A progress bar and checklist for the steps of adding a source. */
export default function SetupSteps({ steps, phase, failed = false, label }) {
  const at = steps.findIndex(([key]) => key === phase);
  const filled = at === -1 ? 0 : ((at + (failed ? 1 : 0.5)) / steps.length) * 100;
  return (
    <>
      <div
        className={`onb-upload__bar ${failed ? 'is-failed' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={Math.max(at, 0)}
      >
        <i style={{ width: `${filled}%` }} />
      </div>
      <ol className="onb-upload__steps">
        {steps.map(([key, text], i) => {
          let state = '';
          if (i < at) state = 'is-done';
          else if (i === at) state = failed ? 'is-failed' : 'is-active';
          return (
            <li key={key} className={state} data-testid={`onb-setup-${key}`} data-state={state}>
              <span aria-hidden="true">{i < at ? '✓' : i === at && failed ? '✕' : '•'}</span>
              {text}
            </li>
          );
        })}
      </ol>
    </>
  );
}
