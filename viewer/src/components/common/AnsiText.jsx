import React, { useMemo } from 'react';

// Foreground SGR colors → readable tints on the dark (gray-900) console bg.
const FG_COLORS = {
  30: '#6b7280',
  31: '#f87171', // red — FAILURE
  32: '#4ade80', // green — SUCCESS
  33: '#fbbf24', // yellow — WARNING
  34: '#60a5fa',
  35: '#c084fc',
  36: '#22d3ee',
  37: '#e5e7eb',
  90: '#9ca3af',
  91: '#fca5a5',
  92: '#86efac',
  93: '#fde68a',
  94: '#93c5fd',
  95: '#d8b4fe',
  96: '#67e8f9',
  97: '#f9fafb',
};

const RESET = { fg: null, bold: false, dim: false, underline: false };

// SGR escape sequence: ESC [ <codes> m. The ESC (0x1b) is required so bare
// `[2m`-style substrings in ordinary log text aren't mistaken for escapes.
// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[([0-9;]*)m/g;

const applyCodes = (state, raw) => {
  const codes = raw === '' ? [0] : raw.split(';').map(n => parseInt(n, 10));
  let next = { ...state };
  for (const code of codes) {
    if (code === 0) next = { ...RESET };
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 24) next.underline = false;
    else if (code === 39) next.fg = null;
    else if (FG_COLORS[code]) next.fg = FG_COLORS[code];
  }
  return next;
};

const spanStyle = state => {
  const style = {};
  if (state.fg) style.color = state.fg;
  if (state.bold) style.fontWeight = 700;
  if (state.dim) style.opacity = 0.7;
  if (state.underline) style.textDecoration = 'underline';
  return style;
};

// Split a string with ANSI SGR escapes into styled runs. Escapes with no text
// between them just fold their codes into the running state (no empty spans).
export const parseAnsi = text => {
  const segments = [];
  let state = { ...RESET };
  let lastIndex = 0;
  let match;
  SGR_RE.lastIndex = 0;
  while ((match = SGR_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), style: state });
    }
    state = applyCodes(state, match[1]);
    lastIndex = SGR_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: state });
  }
  return segments;
};

/**
 * Renders a string that may carry ANSI SGR escapes — the visivo CLI's run
 * output (green SUCCESS, red FAILURE, yellow WARNING, dim paths, underlined
 * object names) — as styled spans, so the log view mirrors the terminal.
 * Supports the small SGR set `visivo/jobs/job.py` emits; unknown codes are
 * ignored. Text renders as React text nodes, so build output can't inject HTML.
 */
export default function AnsiText({ text }) {
  const segments = useMemo(() => parseAnsi(text || ''), [text]);
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={spanStyle(seg.style)}>
          {seg.text}
        </span>
      ))}
    </>
  );
}
