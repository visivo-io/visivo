import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PiMagnifyingGlass,
  PiClockCounterClockwise,
  PiWarningCircle,
  PiArrowElbowDownLeft,
} from 'react-icons/pi';
import { getValueAtPath } from '../SchemaEditor/utils/schemaUtils';
import { rankFields, curatedEntries } from './fieldFinderIndex';
import { readMru, bumpMru, subscribeMru } from './fieldFinderMru';

/**
 * FieldFinderPalette (VIS-1021)
 *
 * ⌘K command palette for the obscure long tail of Plotly trace props. Curating
 * 2-5 Tier-B essentials per type deliberately leaves a median ~188 props behind
 * — this is the first-class access pattern for them: a user who knows the EFFECT
 * ("make the line dashed") finds and sets the prop in one motion.
 *
 * - Empty query → curated Tier A/B first (MRU floated up), then "Show all
 *   fields" reveals the full index.
 * - Typed query → deterministic tiered ranking (exact → synonym → prefix →
 *   fuzzy → keyword → path → description) over the per-type index.
 * - SCALAR results are inline-editable directly in the row (find-and-change is
 *   one motion); COMPOUND results jump-and-focus into the grouped form.
 * - Synonym scope filter: a `scope:'trace'` synonym boosts its paths; a
 *   `scope:'layout'` term (stacked, log scale) returns ZERO field results with
 *   a "belongs in the layout editor" note; a `scope:'none'` term (trend line)
 *   returns a single explanatory row.
 *
 * Controlled + record-agnostic: it owns no persistence. `onEditScalar` writes a
 * scalar prop; `onRevealCompound` asks the host to scroll+highlight the field in
 * the grouped form. Both bump the per-type MRU.
 *
 * @param {object} props
 * @param {string} props.type - chart type (e.g. 'scatter'); MRU/index key.
 * @param {Array<object>} props.entries - the per-type index (buildFieldIndex).
 * @param {object} props.value - the current trace props (for current-value badges).
 * @param {(path: string, nextValue: any) => void} props.onEditScalar
 * @param {(path: string) => void} props.onRevealCompound
 * @param {() => void} props.onClose
 */
const CONTROL_LABEL = {
  number: 'number',
  color: 'color',
  enum: 'option',
  boolean: 'on/off',
  string: 'text',
  array: 'list',
  object: 'group',
  patternMultiselect: 'multi',
  ref: 'ref',
  'query-string': '@expr',
};

const truncate = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Render a compact current-value badge for a prop, or null when unset. */
const formatValue = v => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  return truncate(String(v), 24);
};

/** The inline scalar editor shown on the active row of a scalar result. */
function InlineScalarEditor({ entry, value, onCommit }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value, entry.path]);

  const stop = e => e.stopPropagation();
  const commit = next => onCommit(next);

  if (entry.controlType === 'boolean') {
    return (
      <div className="flex gap-1" onClick={stop}>
        {[true, false].map(b => (
          <button
            key={String(b)}
            type="button"
            onClick={() => commit(b)}
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
              value === b
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'
            }`}
          >
            {b ? 'On' : 'Off'}
          </button>
        ))}
      </div>
    );
  }

  if (entry.controlType === 'enum' && Array.isArray(entry.enumValues)) {
    return (
      <div className="flex flex-wrap gap-1 justify-end max-w-[55%]" onClick={stop}>
        {entry.enumValues.slice(0, 8).map(opt => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => commit(opt)}
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'
            }`}
          >
            {String(opt)}
          </button>
        ))}
      </div>
    );
  }

  if (entry.controlType === 'color') {
    return (
      <div className="flex items-center gap-1.5" onClick={stop}>
        <input
          type="color"
          value={typeof draft === 'string' && /^#/.test(draft) ? draft : '#000000'}
          onChange={e => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          className="h-6 w-6 rounded border border-gray-300 p-0"
          aria-label={`${entry.label} color`}
        />
        <input
          type="text"
          value={draft ?? ''}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit(draft)}
          onBlur={() => commit(draft)}
          className="w-24 px-2 py-0.5 text-[11px] rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
          aria-label={`${entry.label} value`}
        />
      </div>
    );
  }

  // number / string
  return (
    <input
      type={entry.controlType === 'number' ? 'number' : 'text'}
      value={draft ?? ''}
      onClick={stop}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          const v =
            entry.controlType === 'number' && draft !== '' ? Number(draft) : draft || undefined;
          commit(v);
        }
      }}
      onBlur={() => {
        const v =
          entry.controlType === 'number' && draft !== '' ? Number(draft) : draft || undefined;
        commit(v);
      }}
      placeholder={entry.example != null ? String(entry.example) : ''}
      className="w-28 px-2 py-0.5 text-[11px] rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
      aria-label={`${entry.label} value`}
    />
  );
}

export default function FieldFinderPalette({
  type,
  entries = [],
  value = {},
  onEditScalar,
  onRevealCompound,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [mru, setMru] = useState(() => readMru(type));
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => subscribeMru(() => setMru(readMru(type))), [type]);

  const { results, synonym } = useMemo(
    () => rankFields(query, entries, { mru }),
    [query, entries, mru]
  );

  const trimmed = query.trim();
  const layoutScoped = synonym && synonym.scope === 'layout';
  const noneScoped = synonym && synonym.scope === 'none';

  // The rows to render. Empty query → curated (+ optional "all"); a layout/none
  // synonym → zero field rows (the note carries the answer); else ranked results.
  const rows = useMemo(() => {
    if (!trimmed) {
      if (showAll) return entries.filter(e => !e.hidden);
      return curatedEntries(entries, mru);
    }
    if (layoutScoped || noneScoped) return [];
    return results;
  }, [trimmed, showAll, entries, mru, results, layoutScoped, noneScoped]);

  useEffect(() => setActiveIndex(0), [query, showAll]);

  const commitScalar = useCallback(
    (path, next) => {
      onEditScalar?.(path, next);
      bumpMru(type, path);
    },
    [onEditScalar, type]
  );

  const revealCompound = useCallback(
    path => {
      bumpMru(type, path);
      onRevealCompound?.(path);
      onClose?.();
    },
    [onRevealCompound, onClose, type]
  );

  const activateRow = useCallback(
    entry => {
      if (!entry) return;
      if (entry.isScalar) {
        // Focus the inline editor for scalar rows (it's rendered on the active row).
        const el = listRef.current?.querySelector(
          `[data-ff-row="${entry.path}"] [data-ff-inline] input, [data-ff-row="${entry.path}"] [data-ff-inline] button`
        );
        el?.focus();
      } else {
        revealCompound(entry.path);
      }
    },
    [revealCompound]
  );

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activateRow(rows[activeIndex]);
    }
  };

  // Keep the active row scrolled into view (guarded — jsdom has no scrollIntoView).
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-ff-index="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-dark/40 pt-[10vh] px-4"
      data-testid="field-finder-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find fields"
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
          <PiMagnifyingGlass size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Find a ${type || 'chart'} property…`}
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none"
            data-testid="field-finder-input"
            aria-label="Find fields"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1" data-testid="field-finder-results">
          {/* Layout-scoped synonym → belongs elsewhere */}
          {layoutScoped && (
            <div
              className="flex items-start gap-2 px-3 py-3 text-[12.5px] text-gray-600"
              data-testid="field-finder-layout-note"
            >
              <PiWarningCircle size={16} className="text-highlight-500 mt-0.5 shrink-0" />
              <span>
                “{trimmed}” is a chart/layout setting — edit it in the chart’s layout editor, not
                on an individual trace.
              </span>
            </div>
          )}

          {/* scope:'none' synonym → explanatory row */}
          {noneScoped && (
            <div
              className="flex items-start gap-2 px-3 py-3 text-[12.5px] text-gray-600"
              data-testid="field-finder-none-note"
            >
              <PiWarningCircle size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <span>{synonym.note}</span>
            </div>
          )}

          {/* Empty-query header hint */}
          {!trimmed && rows.length > 0 && (
            <div className="px-3 pt-2 pb-1 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                {showAll ? 'All fields' : 'Suggested'}
              </span>
              {mru.length > 0 && !showAll && (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-gray-400">
                  <PiClockCounterClockwise size={11} /> recent first
                </span>
              )}
            </div>
          )}

          {rows.map((entry, i) => {
            const current = getValueAtPath(value, entry.path);
            const badge = formatValue(current);
            const isActive = i === activeIndex;
            const breadcrumb = entry.path.split('.').join(' › ');
            return (
              <div
                key={entry.path}
                data-ff-row={entry.path}
                data-ff-index={i}
                data-testid={`field-finder-row-${entry.path}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => activateRow(entry)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-l-2 ${
                  isActive ? 'bg-primary-50 border-primary-500' : 'border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-gray-900 truncate">
                      {entry.label}
                    </span>
                    {entry.tier && (
                      <span className="px-1 text-[9.5px] font-semibold rounded bg-primary-100 text-primary-700">
                        {entry.tier}
                      </span>
                    )}
                    <span className="px-1 text-[9.5px] rounded bg-gray-100 text-gray-500">
                      {CONTROL_LABEL[entry.controlType] || entry.controlType}
                    </span>
                    {badge != null && (
                      <span
                        className="px-1 text-[9.5px] rounded bg-secondary-100 text-secondary-700"
                        data-testid={`field-finder-value-${entry.path}`}
                        title="Current value"
                      >
                        = {badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    <span className="text-gray-400">{breadcrumb}</span>
                    {entry.description ? ` — ${truncate(entry.description, 70)}` : ''}
                  </div>
                </div>

                {entry.isScalar ? (
                  isActive ? (
                    <div data-ff-inline className="shrink-0">
                      <InlineScalarEditor
                        entry={entry}
                        value={current}
                        onCommit={next => commitScalar(entry.path, next)}
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-300 shrink-0">edit</span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
                    open <PiArrowElbowDownLeft size={11} />
                  </span>
                )}
              </div>
            );
          })}

          {/* No matches for a typed, non-synonym query */}
          {trimmed && !layoutScoped && !noneScoped && rows.length === 0 && (
            <div className="px-3 py-6 text-center text-[12.5px] text-gray-400" data-testid="field-finder-empty">
              No properties match “{trimmed}”.
            </div>
          )}
        </div>

        {/* Footer: "Show all fields" reveal for the empty-query discovery state */}
        {!trimmed && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="px-3 py-2 text-[12px] font-medium text-primary-700 hover:bg-primary-50 border-t border-gray-200 text-left"
            data-testid="field-finder-show-all"
          >
            Show all fields →
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
