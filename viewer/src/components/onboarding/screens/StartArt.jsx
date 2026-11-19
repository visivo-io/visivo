import React from 'react';

const BRAND = 'var(--color-primary-500)';
const ACCENT = 'var(--color-highlight-500)';
const INK = 'var(--onb-ink)';
const EDGE = 'var(--color-primary-100)';
const TINT = 'var(--onb-art-tint)';
const FAINT = 'var(--color-primary-100)';
const TRACK = 'var(--color-primary-50)';
const FLOW = 'var(--color-primary-300)';

const KPIS = [
  { x: 80, value: '1.2M' },
  { x: 190, value: '+18%' },
  { x: 300, value: '42' },
];
const BARS = [24, 38, 30, 50, 44, 62];

export function ExampleArt() {
  return (
    <svg className="onb-art" viewBox="0 0 480 200" aria-hidden="true">
      <defs>
        <linearGradient id="onb-art-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="onb-art__lift">
        <rect x="64" y="22" width="352" height="200" rx="12" fill="#fff" stroke={EDGE} />
        {[82, 93, 104].map(cx => (
          <circle key={cx} cx={cx} cy="38" r="3" fill={EDGE} />
        ))}
        <rect x="190" y="34" width="100" height="8" rx="4" fill={TRACK} />
        <path d="M64 52h352" stroke={TRACK} />
        {KPIS.map(k => (
          <g key={k.x}>
            <rect x={k.x} y="62" width="100" height="38" rx="7" fill={TINT} />
            <rect x={k.x + 10} y="70" width="36" height="5" rx="2.5" fill={FAINT} />
            <text x={k.x + 10} y="92" fontSize="13" fontWeight="700" fill={INK}>
              {k.value}
            </text>
          </g>
        ))}
        <rect x="80" y="110" width="156" height="100" rx="7" fill={TINT} />
        <rect x="90" y="119" width="44" height="5" rx="2.5" fill={FAINT} />
        {BARS.map((h, i) => (
          <rect
            key={i}
            className="onb-art__bar"
            style={{ animationDelay: `${180 + i * 60}ms` }}
            x={94 + i * 22}
            y={194 - h}
            width="12"
            height={h}
            rx="2.5"
            fill={BRAND}
            opacity={0.55 + i * 0.09}
          />
        ))}
        <rect x="244" y="110" width="156" height="100" rx="7" fill={TINT} />
        <rect x="254" y="119" width="44" height="5" rx="2.5" fill={FAINT} />
        <path
          d="M256 184l22-12 20 6 24-22 20 8 22-24 24 6v48H256z"
          fill="url(#onb-art-area)"
        />
        <path
          className="onb-art__line"
          pathLength="1"
          d="M256 184l22-12 20 6 24-22 20 8 22-24 24 6"
          fill="none"
          stroke={ACCENT}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="388" cy="146" r="3.5" fill="#fff" stroke={ACCENT} strokeWidth="2" />
      </g>
      <g className="onb-art__float">
        <rect x="386" y="84" width="74" height="28" rx="14" fill="#fff" stroke={EDGE} />
        <path d="M399 102l5-8 5 8z" fill={ACCENT} />
        <text x="415" y="103" fontSize="12" fontWeight="700" fill={INK}>
          24%
        </text>
      </g>
      <g className="onb-art__float onb-art__float--late">
        <rect x="20" y="112" width="68" height="68" rx="12" fill="#fff" stroke={EDGE} />
        <circle cx="54" cy="146" r="17" fill="none" stroke={TRACK} strokeWidth="8" />
        <circle
          cx="54"
          cy="146"
          r="17"
          fill="none"
          stroke={BRAND}
          strokeWidth="8"
          strokeDasharray="68 107"
          strokeLinecap="round"
          transform="rotate(-90 54 146)"
        />
      </g>
    </svg>
  );
}

const FILE_GLYPH = (
  <path
    d="M1 0h7l4 4v11a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1zm7 0v4h4"
    fill="none"
    stroke={BRAND}
    strokeWidth="1.4"
    strokeLinejoin="round"
  />
);
const DATABASE_GLYPH = (
  <g fill="none" stroke={BRAND} strokeWidth="1.4">
    <ellipse cx="7" cy="3" rx="7" ry="3" />
    <path d="M0 3v10c0 4 14 4 14 0V3M0 8c0 4 14 4 14 0" />
  </g>
);
const INPUTS = [
  { y: 26, label: 'orders.csv', glyph: FILE_GLYPH },
  { y: 82, label: 'PostgreSQL', glyph: DATABASE_GLYPH },
  { y: 138, label: 'Snowflake', glyph: DATABASE_GLYPH },
];
const ANSWER_BARS = [20, 32, 26, 42, 36, 52];

export function DataArt() {
  return (
    <svg className="onb-art" viewBox="0 0 480 200" aria-hidden="true">
      {INPUTS.map(input => (
        <path
          key={input.label}
          className="onb-art__flow"
          d={`M160 ${input.y + 18}C230 ${input.y + 18} 226 100 296 100`}
          fill="none"
          stroke={FLOW}
          strokeWidth="1.6"
          strokeDasharray="3 6"
          strokeLinecap="round"
        />
      ))}
      {INPUTS.map((input, i) => (
        <g
          key={input.label}
          className="onb-art__chip"
          style={{ animationDelay: `${120 + i * 90}ms` }}
        >
          <rect x="28" y={input.y} width="132" height="36" rx="9" fill="#fff" stroke={EDGE} />
          <g transform={`translate(41 ${input.y + 10})`}>{input.glyph}</g>
          <text x="66" y={input.y + 22.5} fontSize="12" fontWeight="600" fill={INK}>
            {input.label}
          </text>
          <circle cx="160" cy={input.y + 18} r="3" fill="#fff" stroke={BRAND} strokeWidth="1.5" />
        </g>
      ))}
      <g className="onb-art__lift">
        <rect x="296" y="36" width="156" height="128" rx="12" fill="#fff" stroke={EDGE} />
        <rect x="310" y="50" width="56" height="6" rx="3" fill={FAINT} />
        <rect x="310" y="62" width="34" height="5" rx="2.5" fill={TRACK} />
        {ANSWER_BARS.map((h, i) => (
          <rect
            key={i}
            className="onb-art__bar"
            style={{ animationDelay: `${420 + i * 60}ms` }}
            x={312 + i * 22}
            y={148 - h}
            width="12"
            height={h}
            rx="2.5"
            fill={BRAND}
            opacity={0.55 + i * 0.09}
          />
        ))}
        <circle cx="296" cy="100" r="4" fill={BRAND} />
      </g>
      <g className="onb-art__float">
        <circle cx="448" cy="40" r="13" fill={ACCENT} />
        <path
          d="M442 40l4.5 4.5 8-9"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
