import React from 'react';

const TypeIcons = {
  source: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
    </g>
  ),
  model: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5L12 12l8-4.5" />
      <path d="M12 12v9" />
    </g>
  ),
  metric: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 18h16" />
      <path d="M7 14v4" />
      <path d="M11 10v8" />
      <path d="M15 6v12" />
      <path d="M19 12v6" />
    </g>
  ),
  dimension: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.4" />
      <path d="M3.5 9h17" />
      <path d="M9 3.5v17" />
    </g>
  ),
  relation: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M8.5 12h7" />
    </g>
  ),
  semantic: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="4" y="4" width="14" height="3" rx="0.6" />
      <rect x="4" y="10.5" width="14" height="3" rx="0.6" />
      <rect x="4" y="17" width="14" height="3" rx="0.6" />
    </g>
  ),
  insight: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-6 4 3 6-8" />
      <path d="M14 6h4v4" />
    </g>
  ),
  chart: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="1.6" />
      <path d="M6 9h6" />
      <path d="M6 13h4" />
      <path d="M14 17l2-3 2 1.5 2-2.5" />
    </g>
  ),
  input: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="10" cy="17" r="2" />
    </g>
  ),
  dashboard: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="9" rx="1.2" />
      <rect x="13" y="3" width="8" height="5" rx="1.2" />
      <rect x="13" y="10" width="8" height="11" rx="1.2" />
      <rect x="3" y="14" width="8" height="7" rx="1.2" />
    </g>
  ),
};

const NODES = [
  { id: 'source', label: 'Source', color: '#f97316' },
  { id: 'model', label: 'Model', color: '#f59e0b' },
  {
    id: 'semantic',
    label: 'Semantic',
    color: '#22c55e',
    stacked: true,
    sub: [
      { id: 'metric', label: 'Metric', color: '#22c55e' },
      { id: 'dimension', label: 'Dimension', color: '#16a34a' },
      { id: 'relation', label: 'Relation', color: '#15803d' },
    ],
  },
  { id: 'insight', label: 'Insight', color: '#a855f7' },
  { id: 'chart', label: 'Chart', color: '#8b5cf6' },
  { id: 'input', label: 'Input', color: '#6366f1' },
  { id: 'dashboard', label: 'Dashboard', color: '#f43f5e' },
];

export default function DagMini({ step, onNavigate, placement = 'inline' }) {
  return (
    <div className={`onb-dag onb-dag--${placement}`} title={`Step ${step} of ${NODES.length}`}>
      {NODES.map((n, i) => {
        const lit = i < step;
        const current = i === step - 1;
        const expand = current && n.stacked;
        const clickable = lit && !current && !!onNavigate;
        const handleClick = clickable ? () => onNavigate(n.id) : undefined;
        return (
          <React.Fragment key={n.id}>
            {i > 0 && <span className={`onb-dag__edge ${lit ? 'onb-dag__edge--lit' : ''}`} />}
            {expand ? (
              <span className="onb-dag__cluster">
                {n.sub.map(s => (
                  <span
                    key={s.id}
                    className="onb-dag__node onb-dag__node--lit onb-dag__node--current"
                    style={{ color: s.color, borderColor: s.color }}
                    title={s.label}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      {TypeIcons[s.id]}
                    </svg>
                  </span>
                ))}
              </span>
            ) : (
              <span className="onb-dag__node-wrap">
                <button
                  type="button"
                  onClick={handleClick}
                  disabled={!clickable}
                  className={`onb-dag__node ${lit ? 'onb-dag__node--lit' : ''} ${
                    current ? 'onb-dag__node--current' : ''
                  } ${clickable ? 'onb-dag__node--clickable' : ''}`}
                  style={lit ? { color: n.color, borderColor: n.color } : undefined}
                  title={clickable ? `← Back to ${n.label}` : n.label}
                  aria-label={clickable ? `Go back to ${n.label}` : n.label}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    {TypeIcons[n.id]}
                  </svg>
                </button>
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
