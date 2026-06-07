import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiX, PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon, getTypeColors, getTypeByValue } from '../../common/objectTypeConfigs';

/**
 * ReferencePicker — VIS-792 / Track L L-2.
 *
 * Modal that lets a user pick a replacement reference for a broken canvas slot
 * (a slot whose chart/table/markdown/input ref no longer resolves). Triggered by
 * the <BrokenRefCard> "Fix..." button.
 *
 * Per the L-2 brief (`specs/.../06-phase-5-polish.md`):
 *   - Centered modal (~480×640, responsive).
 *   - Header "Pick a chart" (matching the broken field type) + close (X).
 *   - Search input filters the list of available objects of the expected type.
 *   - Scrollable object list — each row: type icon (objectTypeConfigs), name,
 *     small description (e.g. a chart's underlying insight), click-to-select.
 *   - "Create new…" link → the existing <CreateButton> flow (via `onCreateNew`).
 *   - Empty state — no objects of the type exist → prominent create CTA.
 *
 * Click-to-select is the single selection affordance (no separate "Use this"
 * button), per the acceptance checklist's "pick one and stick with it".
 *
 * The store object lists are the single source for available objects; type
 * icons + colours come from the shared objectTypeConfigs palette.
 */

// Map a leaf field (chart/table/markdown/input) to the store list + getter that
// supply that type's available objects. The picker is leaf-type-scoped.
const TYPE_SLICES = {
  chart: { listKey: 'charts', singular: 'chart' },
  table: { listKey: 'tables', singular: 'table' },
  markdown: { listKey: 'markdowns', singular: 'markdown' },
  input: { listKey: 'inputs', singular: 'input' },
};

// A short, type-appropriate description line for an object row.
const describeObject = (type, obj) => {
  if (!obj) return null;
  if (type === 'chart' || type === 'table') {
    const insights = obj.insights || obj.config?.insights;
    if (Array.isArray(insights) && insights.length > 0) {
      const first = insights[0];
      const name = typeof first === 'string' ? first : first?.name;
      if (name) return `insight: ${name}`;
    }
    const data = obj.data || obj.config?.data;
    if (typeof data === 'string') return `data: ${data}`;
  }
  return null;
};

const ObjectRow = ({ type, obj, onSelect }) => {
  const Icon = getTypeIcon(type);
  const colors = getTypeColors(type);
  const description = describeObject(type, obj);
  return (
    <button
      type="button"
      data-testid={`reference-picker-row-${obj.name}`}
      onClick={() => onSelect(obj.name)}
      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50 focus:border-primary-300 focus:bg-primary-50 focus:outline-none"
    >
      <span
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
          colors.node,
          colors.text,
        ].join(' ')}
      >
        <Icon style={{ fontSize: 18 }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{obj.name}</span>
        {description && (
          <span className="block truncate text-xs text-gray-500">{description}</span>
        )}
      </span>
    </button>
  );
};

const ListSkeleton = () => (
  <div className="space-y-2" data-testid="reference-picker-skeleton" aria-hidden="true">
    {[0, 1, 2, 3, 4].map(i => (
      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-gray-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    ))}
  </div>
);

const ReferencePicker = ({ type, onSelect, onClose, onCreateNew, loading = false }) => {
  const slice = TYPE_SLICES[type] || TYPE_SLICES.chart;
  const rawObjects = useStore(s => s[slice.listKey]);
  const objects = useMemo(() => rawObjects || [], [rawObjects]);
  const typeMeta = getTypeByValue(type);
  const singularLabel = typeMeta?.singularLabel || slice.singular;

  const [query, setQuery] = useState('');
  const dialogRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    // Focus the search box on open so keyboard users can filter immediately.
    if (searchRef.current) searchRef.current.focus();
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = objects.filter(o => o && o.name);
    if (!q) return list;
    return list.filter(o => o.name.toLowerCase().includes(q));
  }, [objects, query]);

  const isEmpty = !loading && objects.length === 0;
  const noMatches = !loading && objects.length > 0 && filtered.length === 0;

  return createPortal(
    <div
      data-testid="reference-picker-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={e => {
        // Close on backdrop click (but not on clicks inside the dialog).
        if (e.target === e.currentTarget) onClose && onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick a ${singularLabel.toLowerCase()}`}
        data-testid="reference-picker"
        className="flex max-h-[640px] w-full max-w-[480px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-gray-200"
        style={{ height: 'min(640px, 90vh)' }}
      >
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 px-4">
          <h2
            data-testid="reference-picker-title"
            className="flex-1 text-base font-semibold text-gray-900"
          >
            Pick a {singularLabel.toLowerCase()}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="reference-picker-close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <PiX className="h-4 w-4" />
          </button>
        </header>

        {/* Search */}
        <div className="shrink-0 border-b border-gray-100 px-4 py-3">
          <div className="flex h-9 items-center gap-2 rounded-lg bg-gray-50 px-3 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-primary-200">
            <PiMagnifyingGlass className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${slice.listKey}…`}
              spellCheck={false}
              aria-label={`Search available ${slice.listKey}`}
              data-testid="reference-picker-search"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
            />
          </div>
        </div>

        {/* Body */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          data-testid="reference-picker-list"
        >
          {loading ? (
            <ListSkeleton />
          ) : isEmpty ? (
            <div
              className="flex h-full flex-col items-center justify-center px-6 py-10 text-center"
              data-testid="reference-picker-empty"
            >
              <span
                className={[
                  'mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border',
                  getTypeColors(type).node,
                  getTypeColors(type).text,
                ].join(' ')}
              >
                {(() => {
                  const Icon = getTypeIcon(type);
                  return <Icon style={{ fontSize: 24 }} />;
                })()}
              </span>
              <p className="text-sm font-medium text-gray-900">
                No {slice.listKey} available
              </p>
              <p className="mt-1 max-w-xs text-xs text-gray-500">
                Create a {singularLabel.toLowerCase()} to fix this slot.
              </p>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={() => onCreateNew(type)}
                  data-testid="reference-picker-empty-create"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  <PiPlus className="h-4 w-4" />
                  Create new {singularLabel.toLowerCase()}
                </button>
              )}
            </div>
          ) : noMatches ? (
            <p
              className="px-3 py-8 text-center text-sm text-gray-500"
              data-testid="reference-picker-no-matches"
            >
              No {slice.listKey} match “{query}”.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map(obj => (
                <ObjectRow key={obj.name} type={type} obj={obj} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Footer: create-new link (hidden in the empty state, which has its own CTA) */}
        {!isEmpty && onCreateNew && (
          <footer className="shrink-0 border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              onClick={() => onCreateNew(type)}
              data-testid="reference-picker-create"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              <PiPlus className="h-4 w-4" />
              Create new {singularLabel.toLowerCase()}…
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReferencePicker;
