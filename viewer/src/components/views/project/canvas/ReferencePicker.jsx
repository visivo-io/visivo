import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiX, PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon, getTypeColors, getTypeByValue } from '../../common/objectTypeConfigs';

/**
 * ReferencePicker — VIS-792 / Track L L-2, promoted by W5 (click-to-pick).
 *
 * Modal that lets a user pick an object reference for a canvas slot. Two
 * consumers:
 *
 *   - <BrokenRefCard>'s "Fix…" (the original L-2 flow) — single `type` mode:
 *     the picker is scoped to the broken leaf's type (chart/table/markdown/
 *     input) and picking re-points the leaf.
 *   - Click-to-pick (W5): an EMPTY canvas slot click, or the right rail's
 *     "Choose…" on an empty item — multi-`types` mode (charts + insights in
 *     typed sections). Picking a chart places it; picking an insight
 *     auto-wraps it in a minted chart (#637 pattern) at the call site.
 *
 * Per the L-2 brief (`specs/.../06-phase-5-polish.md`):
 *   - Centered modal (~480×640, responsive).
 *   - Header "Pick a chart" (matching the field type(s)) + close (X).
 *   - Search input filters the list of available objects.
 *   - Scrollable object list — each row: type icon (objectTypeConfigs), name,
 *     small description (e.g. a chart's underlying insight), click-to-select.
 *   - "Create new…" link → the existing <CreateButton> flow (via `onCreateNew`).
 *   - Empty state — no objects of the type(s) exist → prominent create CTA.
 *
 * Click-to-select is the single selection affordance (no separate "Use this"
 * button), per the acceptance checklist's "pick one and stick with it".
 * `onSelect(name, type)` — the second argument tells multi-type consumers
 * WHICH section the pick came from; single-type consumers may ignore it.
 *
 * The store object lists are the single source for available objects; type
 * icons + colours come from the shared objectTypeConfigs palette.
 */

// Map a pickable type to the store list that supplies that type's available
// objects. `insight` joins the leaf types for the click-to-pick multi mode
// (an insight pick is auto-wrapped in a chart by the consumer — items never
// take a bare insight).
const TYPE_SLICES = {
  chart: { listKey: 'charts', singular: 'chart' },
  table: { listKey: 'tables', singular: 'table' },
  markdown: { listKey: 'markdowns', singular: 'markdown' },
  input: { listKey: 'inputs', singular: 'input' },
  insight: { listKey: 'insights', singular: 'insight' },
};

// Tab-order members of the dialog, for the focus trap. Deliberately does NOT
// filter on visibility (jsdom reports every element as unrendered), so the
// trap behaves identically in tests and the browser.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

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
      data-picker-type={type}
      onClick={() => onSelect(obj.name, type)}
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

// Typed section header for the multi-type mode — objectTypeConfigs colours +
// icon, so a "Charts" band and an "Insights" band read in each type's palette.
const SectionHeader = ({ type }) => {
  const Icon = getTypeIcon(type);
  const colors = getTypeColors(type);
  const meta = getTypeByValue(type);
  return (
    <div
      className="flex items-center gap-1.5 px-3 pb-1 pt-2"
      data-testid={`reference-picker-section-${type}`}
    >
      <Icon style={{ fontSize: 14 }} className={colors.text} aria-hidden="true" />
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${colors.text}`}>
        {meta?.label || type}
      </span>
    </div>
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

const ReferencePicker = ({ type, types, onSelect, onClose, onCreateNew, loading = false }) => {
  // Normalise to an ordered list of pickable types: `types` (multi mode) wins,
  // else the single `type` (BrokenRefCard's original contract), else chart.
  const typeList = useMemo(() => {
    const requested = Array.isArray(types) && types.length > 0 ? types : [type || 'chart'];
    const valid = requested.filter(t => TYPE_SLICES[t]);
    return valid.length > 0 ? valid : ['chart'];
  }, [type, types]);
  const isMulti = typeList.length > 1;

  // Hook-order-stable store reads: every slice is subscribed unconditionally,
  // then `typeList` picks the ones this mount actually lists.
  const charts = useStore(s => s.charts);
  const tables = useStore(s => s.tables);
  const markdowns = useStore(s => s.markdowns);
  const inputs = useStore(s => s.inputs);
  const insights = useStore(s => s.insights);
  const listsByType = useMemo(
    () => ({
      chart: charts || [],
      table: tables || [],
      markdown: markdowns || [],
      input: inputs || [],
      insight: insights || [],
    }),
    [charts, tables, markdowns, inputs, insights]
  );

  const singularLabels = typeList.map(
    t => getTypeByValue(t)?.singularLabel?.toLowerCase() || TYPE_SLICES[t].singular
  );
  const listKeys = typeList.map(t => TYPE_SLICES[t].listKey);
  const titleLabel = singularLabels.join(' or ');
  const listLabel = listKeys.join(isMulti ? ' and ' : '');
  // Create-new targets the primary (first) type — for click-to-pick that is
  // the chart, whose create flow exists everywhere the picker mounts.
  const createType = typeList[0];
  const createLabel =
    getTypeByValue(createType)?.singularLabel?.toLowerCase() || TYPE_SLICES[createType].singular;

  const [query, setQuery] = useState('');
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    // Remember what opened us, focus the search box so keyboard users can
    // filter immediately, and hand focus BACK on close. Without the restore,
    // closing (Escape / X / backdrop) drops `document.activeElement` to
    // <body>, and the next Tab restarts at the top of the document — the
    // click-to-pick path is sold as keyboard-completable, so stranding the
    // user away from the slot they were filling is not acceptable. When the
    // opener is gone (a successful pick unmounts the slot button it filled)
    // there is nothing to return to, so we leave focus alone rather than
    // throwing at a detached node.
    returnFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    if (searchRef.current) searchRef.current.focus();
    return () => {
      const opener = returnFocusRef.current;
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        onClose && onClose();
        return;
      }
      // Focus TRAP. `aria-modal="true"` promises assistive tech that nothing
      // outside this dialog is reachable; without a trap that promise is a
      // lie — Shift+Tab from the search box walks straight out into the page
      // behind the backdrop. Cycle within the dialog instead, and pull focus
      // back in if it ever escapes.
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Per-type sections: total (unfiltered) + the query-filtered rows.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return typeList.map(t => {
      const list = (listsByType[t] || []).filter(o => o && o.name);
      const filtered = q ? list.filter(o => o.name.toLowerCase().includes(q)) : list;
      return { type: t, total: list.length, objects: filtered };
    });
  }, [typeList, listsByType, query]);

  const totalCount = sections.reduce((sum, s) => sum + s.total, 0);
  const filteredCount = sections.reduce((sum, s) => sum + s.objects.length, 0);
  const isEmpty = !loading && totalCount === 0;
  const noMatches = !loading && totalCount > 0 && filteredCount === 0;

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
        aria-label={`Pick a ${titleLabel}`}
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
            Pick a {titleLabel}
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
              placeholder={`Search ${listLabel}…`}
              spellCheck={false}
              aria-label={`Search available ${listLabel}`}
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
                  getTypeColors(createType).node,
                  getTypeColors(createType).text,
                ].join(' ')}
              >
                {(() => {
                  const Icon = getTypeIcon(createType);
                  return <Icon style={{ fontSize: 24 }} />;
                })()}
              </span>
              <p className="text-sm font-medium text-gray-900">
                No {listLabel} available
              </p>
              <p className="mt-1 max-w-xs text-xs text-gray-500">
                Create a {createLabel} to fill this slot.
              </p>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={() => onCreateNew(createType)}
                  data-testid="reference-picker-empty-create"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  <PiPlus className="h-4 w-4" />
                  Create new {createLabel}
                </button>
              )}
            </div>
          ) : noMatches ? (
            <p
              className="px-3 py-8 text-center text-sm text-gray-500"
              data-testid="reference-picker-no-matches"
            >
              No {listLabel} match “{query}”.
            </p>
          ) : (
            <div className="space-y-1">
              {sections.map(section =>
                section.objects.length === 0 ? null : (
                  <React.Fragment key={section.type}>
                    {isMulti && <SectionHeader type={section.type} />}
                    {section.objects.map(obj => (
                      <ObjectRow
                        key={`${section.type}-${obj.name}`}
                        type={section.type}
                        obj={obj}
                        onSelect={onSelect}
                      />
                    ))}
                  </React.Fragment>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer: create-new link (hidden in the empty state, which has its own CTA) */}
        {!isEmpty && onCreateNew && (
          <footer className="shrink-0 border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              onClick={() => onCreateNew(createType)}
              data-testid="reference-picker-create"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              <PiPlus className="h-4 w-4" />
              Create new {createLabel}…
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReferencePicker;
