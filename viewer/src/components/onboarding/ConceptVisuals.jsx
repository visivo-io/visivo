import React from 'react';

function Stage({ children }) {
  return <div className="onb-concept-stage">{children}</div>;
}

function SourceVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="onb-src-cyl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5a2f45" />
          <stop offset="100%" stopColor="#713b57" />
        </linearGradient>
        <radialGradient id="onb-src-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(113,59,87,0.45)" />
          <stop offset="100%" stopColor="rgba(113,59,87,0)" />
        </radialGradient>
      </defs>
      <circle cx="240" cy="200" r="160" fill="url(#onb-src-glow)">
        <animate attributeName="r" values="140;180;140" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3.6s" repeatCount="indefinite" />
      </circle>
      <g transform="translate(240 200)">
        <ellipse cx="0" cy="-50" rx="62" ry="16" fill="url(#onb-src-cyl)" />
        <rect x="-62" y="-50" width="124" height="100" fill="url(#onb-src-cyl)" />
        <ellipse cx="0" cy="50" rx="62" ry="16" fill="#5a2f45" />
        <ellipse cx="0" cy="-30" rx="62" ry="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <ellipse cx="0" cy="-10" rx="62" ry="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <ellipse cx="0" cy="10" rx="62" ry="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <ellipse cx="0" cy="30" rx="62" ry="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <ellipse cx="0" cy="-50" rx="62" ry="16" fill="none" stroke="rgba(210,89,70,0.85)" strokeWidth="2">
          <animate attributeName="rx" values="62;90;62" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="ry" values="16;24;16" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.85;0;0.85" dur="2.4s" repeatCount="indefinite" />
        </ellipse>
      </g>
      {[
        { x1: 240, y1: 150, x2: 80, y2: 80, d: 0.0 },
        { x1: 240, y1: 150, x2: 400, y2: 80, d: 0.7 },
        { x1: 240, y1: 250, x2: 80, y2: 320, d: 1.4 },
        { x1: 240, y1: 250, x2: 400, y2: 320, d: 0.35 },
      ].map((p, i) => (
        <g key={i}>
          <line
            x1={p.x1}
            y1={p.y1}
            x2={p.x2}
            y2={p.y2}
            stroke="rgba(113,59,87,0.18)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
          <circle r="3.5" fill="#d25946">
            <animateMotion
              dur="2.6s"
              repeatCount="indefinite"
              begin={`${p.d}s`}
              path={`M ${p.x1} ${p.y1} L ${p.x2} ${p.y2}`}
            />
          </circle>
        </g>
      ))}
      {[
        [80, 80],
        [400, 80],
        [80, 320],
        [400, 320],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect x="-22" y="-14" width="44" height="28" rx="4" fill="#fff" stroke="rgba(0,0,0,0.08)" />
          <rect x="-22" y="-14" width="44" height="7" fill="rgba(113,59,87,0.12)" />
          <line x1="-16" y1="-2" x2="16" y2="-2" stroke="rgba(0,0,0,0.1)" />
          <line x1="-16" y1="4" x2="16" y2="4" stroke="rgba(0,0,0,0.1)" />
          <line x1="-16" y1="10" x2="16" y2="10" stroke="rgba(0,0,0,0.1)" />
        </g>
      ))}
    </svg>
  );
}

function ModelVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%">
      <g transform="translate(70 200)">
        <ellipse cx="0" cy="-30" rx="34" ry="9" fill="#713b57" />
        <rect x="-34" y="-30" width="68" height="60" fill="#713b57" />
        <ellipse cx="0" cy="30" rx="34" ry="9" fill="#5a2f45" />
      </g>
      <g fontFamily="source-code-pro,monospace" fontSize="11" fill="rgba(0,0,0,0.55)">
        {['SELECT  *', 'FROM    orders', 'JOIN    users', 'WHERE   ts >', 'GROUP BY week'].map(
          (line, i) => (
            <text key={i} x={130} y={120 + i * 22} opacity="0">
              {line}
              <animate
                attributeName="opacity"
                values="0;1;1;0.3"
                dur="3s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
            </text>
          )
        )}
      </g>
      <path
        d="M 250 200 C 290 200 310 200 340 200"
        stroke="rgba(113,59,87,0.4)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <circle r="3" fill="#d25946">
        <animateMotion
          dur="1.6s"
          repeatCount="indefinite"
          path="M 250 200 C 290 200 310 200 340 200"
        />
      </circle>
      <g transform="translate(360 130)">
        <rect x="0" y="0" width="100" height="140" rx="6" fill="#fff" stroke="rgba(0,0,0,0.1)" />
        <rect x="0" y="0" width="100" height="22" fill="rgba(113,59,87,0.08)" />
        <text
          x="8"
          y="15"
          fontFamily="source-code-pro,monospace"
          fontSize="10"
          fontWeight="600"
          fill="#5a2f45"
        >
          weekly_sales
        </text>
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <rect
              x="0"
              y={28 + i * 22}
              width="100"
              height="22"
              fill={i % 2 ? 'rgba(0,0,0,0.02)' : 'transparent'}
            />
            <rect x="6" y={32 + i * 22} width="40" height="6" rx="2" fill="rgba(0,0,0,0.18)" />
            <rect
              x="52"
              y={32 + i * 22}
              width="38"
              height="6"
              rx="2"
              fill="rgba(113,59,87,0.5)"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

function SemanticVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="onb-sem-glow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.20)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0)" />
        </linearGradient>
        <marker id="onb-arrow-down" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="rgba(0,0,0,0.30)" />
        </marker>
      </defs>
      <rect x="0" y="0" width="480" height="400" fill="url(#onb-sem-glow)" />
      <g transform="translate(160 28)">
        <rect width="160" height="44" rx="8" fill="#fff" stroke="rgba(0,0,0,0.10)" />
        <text
          x="80"
          y="20"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#9ca3af"
          letterSpacing="0.06em"
        >
          MODEL
        </text>
        <text x="80" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111">
          orders.sql
        </text>
      </g>
      <path d="M240 76 L240 100" stroke="rgba(0,0,0,0.20)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path
        d="M240 100 L130 130 M240 100 L240 130 M240 100 L350 130"
        stroke="rgba(0,0,0,0.20)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <g transform="translate(40 130)">
        <rect width="180" height="80" rx="10" fill="#fff" stroke="#22c55e" strokeWidth="1.5" />
        <text x="14" y="22" fontSize="9" fontWeight="700" fill="#22c55e" letterSpacing="0.08em">
          METRIC
        </text>
        <text x="14" y="42" fontSize="13" fontWeight="600" fill="#111">
          revenue
        </text>
        <text x="14" y="60" fontSize="10" fill="#6b7280" fontFamily="source-code-pro,monospace">
          SUM(amount)
        </text>
      </g>
      <g transform="translate(240 130)">
        <rect width="180" height="80" rx="10" fill="#fff" stroke="#16a34a" strokeWidth="1.5" />
        <text x="14" y="22" fontSize="9" fontWeight="700" fill="#16a34a" letterSpacing="0.08em">
          DIMENSION
        </text>
        <text x="14" y="42" fontSize="13" fontWeight="600" fill="#111">
          region
        </text>
        <text x="14" y="60" fontSize="10" fill="#6b7280" fontFamily="source-code-pro,monospace">
          orders.region
        </text>
      </g>
      <g transform="translate(140 230)">
        <rect width="200" height="80" rx="10" fill="#fff" stroke="#15803d" strokeWidth="1.5" />
        <text x="14" y="22" fontSize="9" fontWeight="700" fill="#15803d" letterSpacing="0.08em">
          RELATION
        </text>
        <text x="14" y="42" fontSize="13" fontWeight="600" fill="#111">
          orders → customers
        </text>
        <text x="14" y="60" fontSize="10" fill="#6b7280" fontFamily="source-code-pro,monospace">
          on customer_id
        </text>
        <g transform="translate(150 48)">
          <circle cx="0" cy="0" r="5" fill="#15803d" />
          <circle cx="30" cy="0" r="5" fill="#15803d" />
          <path d="M5 0 L25 0" stroke="#15803d" strokeWidth="1.6" />
        </g>
      </g>
      <path
        d="M240 320 L240 360"
        stroke="rgba(0,0,0,0.30)"
        strokeWidth="1.5"
        markerEnd="url(#onb-arrow-down)"
      />
      <text
        x="240"
        y="380"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="#6b7280"
        letterSpacing="0.06em"
      >
        USED BY EVERY INSIGHT
      </text>
    </svg>
  );
}

function InsightVisual() {
  const heights = [70, 110, 90, 140, 120, 170, 150, 200];
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%">
      <line x1="60" y1="320" x2="440" y2="320" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
      <line x1="60" y1="80" x2="60" y2="320" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
      {[120, 180, 240].map(y => (
        <line key={y} x1="60" y1={y} x2="440" y2={y} stroke="rgba(0,0,0,0.05)" strokeDasharray="2 4" />
      ))}
      {heights.map((h, i) => (
        <rect key={i} x={80 + i * 46} y={320 - h} width="32" height={h} rx={3} fill="#713b57">
          <animate
            attributeName="height"
            values={`0;${h};${h}`}
            dur="2.6s"
            begin={`${i * 0.15}s`}
            fill="freeze"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values={`320;${320 - h};${320 - h}`}
            dur="2.6s"
            begin={`${i * 0.15}s`}
            fill="freeze"
            repeatCount="indefinite"
          />
        </rect>
      ))}
      <polyline
        points={heights.map((h, i) => `${96 + i * 46},${320 - h}`).join(' ')}
        fill="none"
        stroke="#d25946"
        strokeWidth="2.5"
        strokeDasharray="600"
        strokeDashoffset="600"
      >
        <animate attributeName="stroke-dashoffset" values="600;600;0" dur="3.6s" repeatCount="indefinite" />
      </polyline>
      <text x="60" y="62" fontSize="11" fontFamily="source-code-pro,monospace" fill="rgba(0,0,0,0.5)">
        revenue · weekly
      </text>
    </svg>
  );
}

function ChartVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="onb-chart-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(139,92,246,0.18)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0)" />
        </linearGradient>
      </defs>
      <rect width="480" height="400" fill="url(#onb-chart-bg)" />
      <g transform="translate(80 220)">
        <rect width="320" height="140" rx="12" fill="#fff" stroke="#8b5cf6" strokeWidth="1.5" />
        <text x="20" y="28" fontSize="10" fontWeight="700" fill="#8b5cf6" letterSpacing="0.08em">
          CHART
        </text>
        <text x="20" y="62" fontSize="32" fontWeight="700" fill="#111">
          $4.2M
        </text>
        <text x="20" y="80" fontSize="11" fill="#16a34a" fontWeight="600">
          ▲ 18% vs last quarter
        </text>
        <text x="20" y="98" fontSize="10" fill="#6b7280">
          revenue · this quarter
        </text>
        <g transform="translate(180 60)">
          <polyline
            points="0,52 18,46 36,48 54,38 72,32 90,22 108,14 126,8"
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2.2"
          />
          <polyline
            points="0,52 18,46 36,48 54,38 72,32 90,22 108,14 126,8 126,60 0,60"
            fill="rgba(139,92,246,0.12)"
            stroke="none"
          />
          <circle cx="126" cy="8" r="3" fill="#8b5cf6" />
        </g>
      </g>
      <g transform="translate(60 60)">
        <rect width="170" height="120" rx="10" fill="#fff" stroke="rgba(0,0,0,0.08)" />
        <text x="14" y="24" fontSize="10" fontWeight="700" fill="#9ca3af" letterSpacing="0.08em">
          INSIGHT
        </text>
        <text x="14" y="50" fontSize="22" fontWeight="700" fill="#111">
          $4.2M
        </text>
        <text x="14" y="66" fontSize="10" fill="#6b7280">
          revenue · this quarter
        </text>
      </g>
      <g transform="translate(250 60)">
        <rect width="170" height="120" rx="10" fill="#fff" stroke="rgba(0,0,0,0.08)" />
        <text x="14" y="24" fontSize="10" fontWeight="700" fill="#9ca3af" letterSpacing="0.08em">
          INSIGHT
        </text>
        <polyline
          points="14,100 35,90 56,95 78,80 100,72 122,60 144,52"
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
        />
        <text x="14" y="46" fontSize="10" fill="#6b7280">
          trend · last 12 wks
        </text>
      </g>
      <path
        d="M125 195 L165 215"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <path
        d="M355 195 L315 215"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function InputVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%">
      <defs>
        <linearGradient id="onb-inp-track" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#713b57" />
          <stop offset="100%" stopColor="rgba(113,59,87,0.18)" />
        </linearGradient>
      </defs>
      <rect x="60" y="80" width="360" height="6" rx="3" fill="rgba(0,0,0,0.08)" />
      <rect x="60" y="80" width="180" height="6" rx="3" fill="url(#onb-inp-track)">
        <animate attributeName="width" values="80;300;80" dur="4s" repeatCount="indefinite" />
      </rect>
      <circle cx="240" cy="83" r="11" fill="#fff" stroke="#713b57" strokeWidth="2.5">
        <animate attributeName="cx" values="140;360;140" dur="4s" repeatCount="indefinite" />
      </circle>
      <text x="60" y="60" fontSize="10" fontFamily="source-code-pro,monospace" fill="rgba(0,0,0,0.5)">
        date_range
      </text>
      <text
        x="420"
        y="60"
        fontSize="10"
        fontFamily="source-code-pro,monospace"
        fill="rgba(0,0,0,0.5)"
        textAnchor="end"
      >
        last 90 days
      </text>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <rect
          key={i}
          x={70 + i * 46}
          y={300 - 60 - i * 8}
          width="32"
          height={60 + i * 8}
          rx="3"
          fill="#713b57"
        >
          <animate
            attributeName="height"
            values={`${60 + i * 8};${30 + i * 4};${60 + i * 8}`}
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values={`${300 - 60 - i * 8};${300 - 30 - i * 4};${300 - 60 - i * 8}`}
            dur="4s"
            repeatCount="indefinite"
          />
        </rect>
      ))}
      <line x1="60" y1="300" x2="440" y2="300" stroke="rgba(0,0,0,0.18)" />
      <g transform="translate(60 360)">
        <rect x="0" y="0" width="120" height="26" rx="4" fill="#fff" stroke="rgba(0,0,0,0.12)" />
        <text x="10" y="17" fontSize="11" fontFamily="source-code-pro,monospace" fill="rgba(0,0,0,0.55)">
          region: us-east
        </text>
        <path d="M 100 12 l 5 5 l 5 -5" stroke="rgba(0,0,0,0.4)" fill="none" strokeWidth="1.5" />
      </g>
      <g transform="translate(190 360)">
        <rect x="0" y="0" width="100" height="26" rx="4" fill="#fff" stroke="rgba(0,0,0,0.12)" />
        <rect x="6" y="6" width="14" height="14" rx="3" fill="#713b57" />
        <path d="M 9 12 l 3 3 l 5 -5" stroke="#fff" strokeWidth="2" fill="none" />
        <text x="28" y="17" fontSize="11" fontFamily="source-code-pro,monospace" fill="rgba(0,0,0,0.55)">
          YoY
        </text>
      </g>
    </svg>
  );
}

function DashboardVisual() {
  return (
    <svg viewBox="0 0 480 400" width="100%" height="100%">
      <rect
        x="40"
        y="50"
        width="400"
        height="300"
        rx="14"
        fill="#fff"
        stroke="rgba(0,0,0,0.10)"
        strokeDasharray="1200"
        strokeDashoffset="1200"
      >
        <animate attributeName="stroke-dashoffset" values="1200;0" dur="0.9s" fill="freeze" />
      </rect>
      <rect x="40" y="50" width="400" height="36" rx="14" fill="rgba(113,59,87,0.06)">
        <animate attributeName="opacity" values="0;1" dur="0.6s" begin="0.4s" fill="freeze" />
      </rect>
      <circle cx="58" cy="68" r="4" fill="rgba(113,59,87,0.5)" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.6s" fill="freeze" />
      </circle>
      <text x="72" y="72" fontSize="12" fontWeight="600" fill="#5a2f45" opacity="0">
        Q3 Revenue Dashboard
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.7s" fill="freeze" />
      </text>
      <g opacity="0">
        <rect x="60" y="106" width="110" height="68" rx="8" fill="rgba(113,59,87,0.04)" stroke="rgba(0,0,0,0.06)" />
        <text x="72" y="128" fontSize="9" fill="rgba(0,0,0,0.5)">
          Revenue
        </text>
        <text x="72" y="155" fontSize="20" fontWeight="700" fill="#5a2f45">
          $2.4M
        </text>
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.9s" fill="freeze" />
      </g>
      <g opacity="0">
        <rect x="180" y="106" width="160" height="68" rx="8" fill="#fff" stroke="rgba(0,0,0,0.06)" />
        {[20, 32, 24, 40, 30, 45, 38].map((h, i) => (
          <rect key={i} x={190 + i * 20} y={170 - h} width="14" height={h} fill="#713b57" rx="2" />
        ))}
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.1s" fill="freeze" />
      </g>
      <g opacity="0">
        <rect x="350" y="106" width="90" height="68" rx="8" fill="#fff" stroke="rgba(0,0,0,0.06)" />
        <polyline
          points="358,160 372,150 386,158 400,140 414,148 428,128 432,118"
          fill="none"
          stroke="#d25946"
          strokeWidth="1.8"
        />
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.3s" fill="freeze" />
      </g>
      <g opacity="0">
        <rect x="60" y="186" width="220" height="138" rx="8" fill="#fff" stroke="rgba(0,0,0,0.06)" />
        <path
          d="M 70 300 L 90 280 L 110 290 L 130 260 L 150 270 L 170 240 L 190 250 L 210 220 L 230 230 L 250 200 L 270 210 L 270 320 L 70 320 Z"
          fill="rgba(113,59,87,0.18)"
        />
        <path
          d="M 70 300 L 90 280 L 110 290 L 130 260 L 150 270 L 170 240 L 190 250 L 210 220 L 230 230 L 250 200 L 270 210"
          fill="none"
          stroke="#713b57"
          strokeWidth="1.8"
        />
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.5s" fill="freeze" />
      </g>
      <g opacity="0">
        <rect x="290" y="186" width="150" height="138" rx="8" fill="#fff" stroke="rgba(0,0,0,0.06)" />
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <line x1="300" y1={208 + i * 22} x2="430" y2={208 + i * 22} stroke="rgba(0,0,0,0.05)" />
            <rect x="300" y={196 + i * 22} width="40" height="6" rx="2" fill="rgba(0,0,0,0.18)" />
            <rect
              x="350"
              y={196 + i * 22}
              width="60"
              height="6"
              rx="2"
              fill={i % 2 ? '#d25946' : '#713b57'}
              opacity="0.6"
            />
          </g>
        ))}
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.7s" fill="freeze" />
      </g>
    </svg>
  );
}

const VISUAL_BY_ID = {
  source: SourceVisual,
  model: ModelVisual,
  semantic: SemanticVisual,
  insight: InsightVisual,
  chart: ChartVisual,
  input: InputVisual,
  dashboard: DashboardVisual,
};

export default function ConceptVisual({ conceptId }) {
  const Visual = VISUAL_BY_ID[conceptId];
  if (!Visual) return null;
  return (
    <Stage>
      <Visual />
    </Stage>
  );
}

export function WelcomeVisual() {
  return (
    <div className="onb-welcome-visual">
      <svg viewBox="0 0 480 460" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="onb-welcome-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(113,59,87,0.18)" />
          </filter>
        </defs>
        <g transform="translate(60 60)">
          <rect
            x="0"
            y="0"
            width="360"
            height="340"
            rx="16"
            fill="#fff"
            stroke="rgba(0,0,0,0.08)"
            filter="url(#onb-welcome-shadow)"
          />
          <rect x="0" y="0" width="360" height="36" rx="16" fill="#e2d7dd" />
          <rect x="0" y="20" width="360" height="16" fill="#e2d7dd" />
          <circle cx="18" cy="18" r="4" fill="#713b57" />
          <text x="32" y="22" fontSize="11" fontWeight="600" fill="#432334">
            EV Sales · 2025
          </text>
          <g transform="translate(20 60)">
            {[25, 40, 32, 55, 48, 70, 60, 85, 78, 100, 92, 120].map((h, i) => (
              <rect key={i} x={i * 27} y={140 - h} width="20" height={h} rx="3" fill="#713b57">
                <animate
                  attributeName="height"
                  values={`${h};${h * 0.85};${h}`}
                  dur="3s"
                  begin={`${i * 0.07}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values={`${140 - h};${140 - h * 0.85};${140 - h}`}
                  dur="3s"
                  begin={`${i * 0.07}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ))}
          </g>
          <g transform="translate(20 220)">
            <rect x="0" y="0" width="100" height="46" rx="8" fill="rgba(113,59,87,0.06)" />
            <text x="10" y="20" fontSize="9" fill="rgba(0,0,0,0.5)">
              Total units
            </text>
            <text x="10" y="38" fontSize="14" fontWeight="700" fill="#5a2f45">
              14.2M
            </text>
            <rect x="110" y="0" width="100" height="46" rx="8" fill="rgba(113,59,87,0.06)" />
            <text x="120" y="20" fontSize="9" fill="rgba(0,0,0,0.5)">
              YoY growth
            </text>
            <text x="120" y="38" fontSize="14" fontWeight="700" fill="#3f3a3c">
              +38%
            </text>
            <rect x="220" y="0" width="120" height="46" rx="8" fill="rgba(113,59,87,0.06)" />
            <text x="230" y="20" fontSize="9" fill="rgba(0,0,0,0.5)">
              Models tracked
            </text>
            <text x="230" y="38" fontSize="14" fontWeight="700" fill="#5a2f45">
              87
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
