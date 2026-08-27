import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { PiCaretDown, PiWarningCircle, PiTextAa, PiTrash } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeColors, getTypeIcon } from './objectTypeConfigs';
import { PRESET_AGGREGATIONS, isMedianSupported } from './pillGrammar';
import { parseRefValue } from '../../../utils/refString';
import { inferColumnTypes } from '../../../utils/inferColumnTypes';
import { getSourceDialect } from '../../../stores/explorerStore';
import { useModelColumns } from '../workspace/relations/useModelColumns';
import { menuPolicyFor } from './SchemaEditor/utils/slotShape';

// The Index row models the same slice shapes the standalone SliceMenu did.
// `draft.slice` stays the literal expression (`[0]`, `[3]`, `[1:5]`, `''`);
// these translate it to and from the control's mode + inputs.
const sliceModeOf = slice => {
  if (!slice) return '';
  if (slice === '[0]' || slice === '[-1]') return slice;
  const inner = slice.slice(1, -1);
  if (/^-?\d+$/.test(inner)) return 'at';
  if (/^-?\d*:-?\d*$/.test(inner)) return 'range';
  // Strided / list slices are valid but have no control here — see `custom`.
  return 'custom';
};
const atRowOf = slice => (sliceModeOf(slice) === 'at' ? slice.slice(1, -1) : '');
const rangePartsOf = slice =>
  sliceModeOf(slice) === 'range' ? slice.slice(1, -1).split(':') : ['', ''];
const rangeExpr = (start, end) => (start === '' && end === '' ? '' : `[${start}:${end}]`);

const AGG_LABELS = {
  sum: 'SUM',
  avg: 'AVG',
  min: 'MIN',
  max: 'MAX',
  count: 'COUNT',
  count_distinct: 'COUNT DISTINCT',
  median: 'MEDIAN',
};

// 06 §4: non-numeric columns get the restricted preset set. Order matters —
// this is the menu's rendering order.
const NUMERIC_ONLY_AGGS = new Set(['sum', 'avg', 'median']);
const RESTRICTED_AGGS = new Set(['min', 'max', 'count', 'count_distinct']);

const KIND_LABEL = {
  modelRef: 'Model — pick a dimension',
  dimension: 'Dimension',
  aggregate: 'Aggregate',
  metricRef: 'Metric',
  dimensionRef: 'Dimension',
};

/**
 * Best-effort "is this pill's bound column numeric" check (06 §3's drop-time
 * heuristic, reused here to TYPE-RESTRICT the preset list per 06 §4). Reuses
 * the exact row-value inference `CenterPanel`'s results grid already runs
 * (`inferColumnTypes`) against the pill's model's cached query result — no
 * new inference logic. FAILS OPEN (`null` -> menu shows every preset) when
 * there's no cached result to sample yet (a never-run scratch query) or the
 * pill has no bound column at all (metricRef/dimensionRef) — matching the
 * project's existing fail-open convention (`SchemaLeafForm`'s dialect
 * resolution, `expressionPreflight`'s endpoint-unavailable case).
 */
function useColumnIsNumeric(modelName, columnName) {
  const modelState = useStore(s => (modelName ? s.explorerModelStates?.[modelName] : null));
  return useMemo(() => {
    if (!columnName) return null;
    const result = modelState?.enrichedResult || modelState?.queryResult;
    const columns = result?.columns;
    if (!result?.rows?.length || !Array.isArray(columns) || !columns.includes(columnName)) {
      return null;
    }
    const [inferred] = inferColumnTypes([columnName], result.rows);
    return inferred?.normalizedType === 'number';
  }, [modelState, columnName]);
}

/**
 * Resolve the source dialect governing a pill's bound field, for the MEDIAN
 * capability gate (S5 §4's two-case lookup):
 *   1. dimension/aggregate — the ref names a model directly; resolve that
 *      model's source dialect.
 *   2. metricRef/dimensionRef — no model is named; resolve the Metric/
 *      Dimension's OWN `parentModel` first, then the same chain.
 * Fails open (`undefined` -> full preset list) for duckdb/genuinely
 * unresolved, mirroring `SchemaLeafForm.jsx`'s exact resolution + fail-open
 * contract.
 *
 * DRAFT FALLBACK (delta-review fix, HIGH): a fresh, unpromoted scratch query
 * chip is never in the promoted `models` collection, so the promoted-model
 * lookup above always misses for it — which used to fall all the way through
 * to "unresolved" and silently show MEDIAN even on a MySQL/SQLite draft
 * source (S5 verified those two dialects transpile `MEDIAN` into
 * plausible-looking but WRONG SQL, never erroring). Before giving up, this
 * also checks the draft's own `explorerModelStates[modelName].sourceName`
 * against `explorerSources` — the exact resolution
 * `getSourceDialect`/`selectActiveModelSourceDialect` already use for the SQL
 * editor's own expression validation (`explorerStore.js`) — so an unpromoted
 * draft gets the same dialect gate a promoted model would.
 */
export function usePillDialect(state) {
  const models = useStore(s => s.models);
  const sources = useStore(s => s.sources);
  const metrics = useStore(s => s.metrics);
  const dimensions = useStore(s => s.dimensions);
  const explorerModelStates = useStore(s => s.explorerModelStates);
  const explorerSources = useStore(s => s.explorerSources);

  return useMemo(() => {
    if (!state) return undefined;
    let modelName = null;
    if (state.kind === 'dimension' || state.kind === 'aggregate') {
      modelName = state.ref;
    } else if (state.kind === 'metricRef' || state.kind === 'dimensionRef') {
      const list = state.kind === 'metricRef' ? metrics : dimensions;
      const record = (list || []).find(f => f.name === state.ref);
      const raw = record?.parentModel || record?.config?.model || null;
      modelName = raw ? parseRefValue(raw) : null;
    }
    if (!modelName) return undefined;

    const model = (models || []).find(m => m.name === modelName);
    if (model) {
      const sourceRef = model?.config?.source ?? model?.source;
      const sourceName = sourceRef ? parseRefValue(sourceRef) : null;
      const src = (sources || []).find(s => s.name === sourceName || s.source_name === sourceName);
      const t = (src?.type || src?.config?.type || '').toLowerCase();
      if (t) return t === 'postgresql' ? 'postgres' : t;
    }

    // Not (yet) a promoted model — resolve via the draft's own source binding.
    const draftSourceName = explorerModelStates?.[modelName]?.sourceName;
    return getSourceDialect(draftSourceName, explorerSources) || undefined;
  }, [state, models, sources, metrics, dimensions, explorerModelStates, explorerSources]);
}

function MenuRow({ label, selected, onClick, testId, disabled, disabledReason }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={disabled ? undefined : onClick}
      data-testid={testId}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
        disabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'hover:bg-primary-50 text-gray-700'
      } ${selected ? 'font-semibold bg-primary-50 text-primary-700' : ''}`}
    >
      <span
        className={`w-2.5 h-2.5 inline-block rounded-full border-2 flex-shrink-0 ${
          selected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
        }`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-gray-100" aria-hidden="true" />;
}

/**
 * PillMenu — the D10 aggregation pill menu (Explore 2.0 Phase 3b,
 * 06-pill-aggregation-grammar.md §4-§5). Mounts inside `<FieldPill>`'s
 * `extra` slot (the pivot shelf's exact precedent, `PivotShelf.jsx`) as a
 * small chevron trigger + a `SliceMenu`-shaped portal popover.
 *
 * Phase 3b shipped PRESETS-ONLY (S5 §5 item 6): dimension ↔ preset
 * aggregation toggling, dialect-gated MEDIAN, "Manually edit field…" (switches
 * the slot back to raw `RefTextArea` editing — reuses the existing widget,
 * 06 §5), and a preflight warning for the global-name-first ref-collision
 * case. Phase 4 (06 §4) enables "Save as metric…" — for `kind: 'aggregate'`
 * pills only ("state is aggregate/custom" per 06 §4; `custom` isn't
 * reachable via `parse()` yet, see `pillGrammar.js`'s docstring) — when the
 * caller supplies `onSaveAsMetric` (the Build rail's `InsightBuildSection`
 * owns the actual flow: name prompt, collision + server aggregate-ness
 * checks, born-bound `saveMetric`, slot swap, match-and-replace dedup
 * offer). Undefined `onSaveAsMetric` keeps the action disabled, matching
 * every OTHER `TracePropsEditor` consumer that isn't an Insight prop slot.
 *
 * @param {object} props
 * @param {object} props.state - a `pillGrammar.parse()` result for the
 *   CURRENT slot value.
 * @param {(preset: 'dimension'|string) => void} props.onSelectPreset -
 *   called with `'dimension'` or an aggregation key from
 *   `PRESET_AGGREGATIONS`; the caller rebuilds + serializes the new state.
 * @param {() => void} props.onManualEdit - switch this slot to raw
 *   `RefTextArea` editing, pre-filled with the current body.
 * @param {() => void} [props.onSaveAsMetric] - Explore 2.0 Phase 4: promote
 *   this slot's aggregate expression to a named Metric. Enables the action
 *   only for `kind: 'aggregate'` pills; undefined keeps it disabled.
 * @param {() => void} props.onRemove - clear this slot's value.
 * @param {boolean} [props.disabled]
 *
 * T4 (pills-buildrail #10): exposes an imperative `open()` (via `ref` +
 * `useImperativeHandle`) so the pill BODY (not just this chevron) can also
 * open the menu — `PropertyRow` holds a ref and calls it from the pill's own
 * onClick. The chevron stays a real, independently-clickable trigger too
 * (toggle open/closed); its own click handler stops propagation so a click
 * on the 16px chevron doesn't ALSO fire the pill body's onClick underneath it
 * (open, then immediately re-forced-open is harmless, but a toggle-closed
 * immediately reopened would read as a broken click).
 */
const PillMenu = React.forwardRef(
  (
    {
      state,
      slice = null,
      slotShape = 'unknown',
      onApply,
      onManualEdit,
      onSaveAsMetric,
      onRemove,
      disabled = false,
    },
    ref
  ) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // VIS-1241: the menu is a FORM now, not a list of instant commands. Every
  // click used to commit and close, so changing an aggregation AND an index
  // meant opening the menu twice, and there was no way to change the property
  // at all. Edits collect in a draft and land on Apply.
  const buildDraft = useCallback(
    () => ({
      useAs: state?.kind === 'aggregate' ? state.agg : 'dimension',
      // The FULL path, not the bare column: an Apply that doesn't touch the
      // property must round-trip `gdp[0]` unchanged.
      column: state?.propertyPath ?? state?.column ?? '',
      modifier: state?.modifier ?? '',
      slice: slice ?? '',
    }),
    [state, slice]
  );
  const [draft, setDraft] = useState(buildDraft);

  // Seeded on OPEN (not on every state change) so a re-render mid-edit can't
  // stomp what the user is typing.
  const openMenu = useCallback(() => {
    setDraft(buildDraft());
    setOpen(true);
  }, [buildDraft]);

  useImperativeHandle(ref, () => ({ open: openMenu }), [openMenu]);

  // A modelRef is "column-backed" in the sense that matters here: it has a
  // model and needs a property picked (VIS-1242).
  const isColumnBacked =
    state?.kind === 'dimension' || state?.kind === 'aggregate' || state?.kind === 'modelRef';
  const isNumeric = useColumnIsNumeric(isColumnBacked ? state.ref : null, state?.column);
  const dialect = usePillDialect(state);
  const medianAllowed = isMedianSupported(dialect);

  const hasCollisionWarning = !!(state?.statedModel && state?.resolvedParent);
  // 06 §4: "Save-as-metric only when state is aggregate/custom" — `custom`
  // isn't reachable via `parse()` today (see pillGrammar.js's docstring), so
  // in practice this is exactly the `aggregate` kind.
  const saveAsMetricEnabled =
    (state?.kind === 'aggregate' || state?.kind === 'custom') && typeof onSaveAsMetric === 'function';

  const presetIsSelected = preset => draft.useAs === preset;

  // Selecting a preset now EDITS the draft; nothing commits until Apply.
  const handleSelect = preset => setDraft(d => ({ ...d, useAs: preset }));

  const handleApply = () => {
    onApply?.(draft);
    setOpen(false);
  };

  // T4 (pills-buildrail #5): the INITIAL guess (open downward, anchored to
  // the trigger's bottom edge) — `PillMenuPopover` measures its own actual
  // rendered height after mount and flips to open UPWARD when it would
  // overflow the viewport bottom (the common case: the pill row sits near
  // the bottom of the Build rail by design).
  const menuStyle = useMemo(() => {
    if (!open || !triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 260;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - MENU_WIDTH - 8));
    return { top: rect.bottom + 4, left, triggerTop: rect.top, triggerBottom: rect.bottom };
  }, [open]);

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        ref={triggerRef}
        onClick={e => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pill options"
        data-testid="pill-menu-trigger"
        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-current opacity-60 hover:bg-white/60 hover:opacity-100 disabled:opacity-30"
      >
        <PiCaretDown size={10} />
      </button>
      {open &&
        menuStyle &&
        createPortal(
          <PillMenuPopover
            state={state}
            slotShape={slotShape}
            draft={draft}
            setDraft={setDraft}
            onApply={handleApply}
            style={menuStyle}
            onClose={() => setOpen(false)}
            isNumeric={isNumeric}
            medianAllowed={medianAllowed}
            isColumnBacked={isColumnBacked}
            hasCollisionWarning={hasCollisionWarning}
            presetIsSelected={presetIsSelected}
            onSelectPreset={handleSelect}
            onManualEdit={() => {
              onManualEdit?.();
              setOpen(false);
            }}
            saveAsMetricEnabled={saveAsMetricEnabled}
            onSaveAsMetric={() => {
              onSaveAsMetric?.();
              setOpen(false);
            }}
            onRemove={() => {
              onRemove?.();
              setOpen(false);
            }}
            triggerRef={triggerRef}
          />,
          document.body
        )}
    </span>
  );
  }
);
PillMenu.displayName = 'PillMenu';

const PillMenuPopover = ({
  state,
  slotShape,
  draft,
  setDraft,
  onApply,
  style,
  onClose,
  isNumeric,
  medianAllowed,
  isColumnBacked,
  hasCollisionWarning,
  presetIsSelected,
  onSelectPreset,
  onManualEdit,
  saveAsMetricEnabled,
  onSaveAsMetric,
  onRemove,
  triggerRef,
}) => {
  const containerRef = useRef(null);
  // Column list for the property picker. Requested HERE rather than in the
  // parent because this component is mounted only while the menu is open — a
  // property panel full of pills would otherwise fire one schema request per
  // row on every render.
  const modelName = isColumnBacked ? state?.ref || null : null;
  const modelNames = useMemo(() => (modelName ? [modelName] : []), [modelName]);
  const { columnsByModel, loading: columnsLoading } = useModelColumns(modelNames);
  const columns = useMemo(() => columnsByModel?.[modelName] || [], [columnsByModel, modelName]);

  // An unbound `modelRef` (dropped model, nothing chosen yet) opens with
  // `draft.column === ''`, which matches NO <option> — so the browser renders
  // the FIRST column as the visible selection while the draft still says
  // "nothing chosen". Apply then committed an empty column and the pill came
  // back unbound, exactly as if the click had done nothing. Adopt whatever the
  // control is actually showing the moment there is something to show, so the
  // visible selection and the draft can never disagree.
  useEffect(() => {
    if (!columns.length) return;
    setDraft(d => (d.column ? d : { ...d, column: columns[0] }));
  }, [columns, setDraft]);

  // The Index row first shipped as All / First / Last only, which dropped
  // "At row…" and "Rows…" — both of which the standalone SliceMenu offered —
  // along with the slot-shape policy that greys out the ones a given prop
  // can't accept (a scalar-only prop has no use for a range). The popover
  // mounts fresh on every open, so seeding from `draft.slice` here is enough.
  const slicePolicy = menuPolicyFor(slotShape);
  const [indexMode, setIndexMode] = useState(() => sliceModeOf(draft.slice));
  const [atRow, setAtRow] = useState(() => atRowOf(draft.slice));
  const [[rangeStart, rangeEnd], setRange] = useState(() => rangePartsOf(draft.slice));

  const selectIndexMode = mode => {
    setIndexMode(mode);
    // Re-selecting `custom` keeps the authored expression as-is.
    if (mode === 'custom') return;
    const next =
      mode === 'at'
        ? atRow === ''
          ? ''
          : `[${atRow}]`
        : mode === 'range'
          ? rangeExpr(rangeStart, rangeEnd)
          : mode;
    setDraft(d => ({ ...d, slice: next }));
  };
  const setIndexAtRow = value => {
    setAtRow(value);
    setDraft(d => ({ ...d, slice: value === '' ? '' : `[${value}]` }));
  };
  const setIndexRange = (start, end) => {
    setRange([start, end]);
    setDraft(d => ({ ...d, slice: rangeExpr(start, end) }));
  };

  // T4 (pills-buildrail #5): measured-then-flip. `style` is the DOWNWARD
  // guess computed before the popover's actual content (a variable-length
  // preset list + header + collision warning) has rendered anywhere, so its
  // real height isn't knowable in advance. Render once at the guessed
  // position, measure, and if the bottom edge would fall below the
  // viewport, flip to open UPWARD from the trigger's top edge instead — this
  // is the common case since the pill row is anchored near the Build rail's
  // bottom by design (06 §4/§5's own mock).
  const [resolvedTop, setResolvedTop] = useState(style.top);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
    const rect = el.getBoundingClientRect();
    const overflowsBottom = rect.bottom > viewportHeight - 8;
    if (overflowsBottom) {
      const flippedTop = style.triggerTop - rect.height - 4;
      setResolvedTop(Math.max(8, flippedTop));
    } else {
      setResolvedTop(style.top);
    }
    // Re-run only when the anchor itself moves (open/close, trigger reposition) —
    // not on every render, which would fight the flip decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.top, style.triggerTop, style.left]);

  React.useEffect(() => {
    const handler = e => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerType = state?.kind === 'aggregate' || state?.kind === 'metricRef' ? 'metric' : 'dimension';
  const HeaderIcon = getTypeIcon(headerType);
  const headerColors = getTypeColors(headerType);

  const showPreset = preset => {
    if (preset === 'dimension') return true;
    if (!RESTRICTED_AGGS.has(preset) && !NUMERIC_ONLY_AGGS.has(preset)) return true;
    if (preset === 'median') return medianAllowed;
    // Type-restriction (06 §4): confidently-non-numeric columns hide the
    // numeric-only presets (SUM/AVG/MEDIAN); an unknown type (null) fails
    // open and shows everything.
    if (isNumeric === false && NUMERIC_ONLY_AGGS.has(preset)) return false;
    return true;
  };

  return (
    <div
      ref={containerRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl w-64 py-1 text-xs text-gray-700 z-[9999]"
      style={{ top: resolvedTop, left: style.left }}
      data-testid="pill-menu"
      role="menu"
      // React portals bubble events through the REACT tree, not the DOM tree:
      // without this, every click in here also reaches the pill body's
      // open-the-menu handler (PropertyRow's handlePillBodyClick), which
      // re-opened the menu in the same tick that selecting a preset closed
      // it — leaving it stuck open, so the user's next chevron click only
      // appeared to do nothing (it toggled the already-open menu shut).
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      {/* Header — source/field + type (06 §4's anatomy) */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          {HeaderIcon && (
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded ${headerColors.bg} ${headerColors.text}`}
            >
              <HeaderIcon style={{ fontSize: 11 }} />
            </span>
          )}
          <span className="font-medium text-gray-900 truncate">
            {state?.column ? `${state.ref} ▸ ${state.column}` : state?.ref}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">
          {KIND_LABEL[state?.kind] || 'Field'}
          {state?.kind === 'aggregate' && state?.agg ? ` (${AGG_LABELS[state.agg] || state.agg})` : ''}
        </div>
      </div>

      {/* Preflight warning (S5 §3/RESULT): global-name-first collision */}
      {hasCollisionWarning && (
        <div
          data-testid="pill-menu-collision-warning"
          className="mx-2 my-2 flex items-start gap-1.5 rounded-md bg-highlight-50 border border-highlight-200 px-2 py-1.5 text-[11px] text-highlight-700"
        >
          <PiWarningCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            This field is defined on <strong>{state.resolvedParent}</strong>, not{' '}
            <strong>{state.statedModel}</strong> — the query will use {state.resolvedParent}
            &apos;s data.
          </span>
        </div>
      )}

      {isColumnBacked && (
        <>
          {/* VIS-1241: the dimension picker — the half of the pill that could
              never be changed here. The header was static text, so re-pointing
              a pill at a different column meant a drag or a raw-text edit.
              Columns come from the model-schema endpoint, which only started
              answering for uncommitted models in #619. */}
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Dimension
          </div>
          <div className="px-3 pb-1.5">
            {columns.length ? (
              <select
                value={draft.column}
                onChange={e => setDraft(d => ({ ...d, column: e.target.value }))}
                data-testid="pill-menu-property"
                aria-label="Dimension"
                className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
              >
                {!columns.includes(draft.column) && draft.column && (
                  <option value={draft.column}>{draft.column}</option>
                )}
                {columns.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              // No schema to offer (never-run draft, non-SQL model): keep it
              // editable rather than trapping the pill on its current column.
              <input
                type="text"
                value={draft.column}
                onChange={e => setDraft(d => ({ ...d, column: e.target.value }))}
                data-testid="pill-menu-property"
                aria-label="Dimension"
                className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
              />
            )}
            {/* A hint, not a replacement — the field stays editable while the
                schema loads so a slow fetch never blocks the edit. */}
            {columnsLoading && !columns.length && (
              <div className="mt-1 text-[10px] text-gray-400" data-testid="pill-menu-columns-loading">
                Loading columns…
              </div>
            )}
          </div>
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Use as
          </div>
          <MenuRow
            label="Value"
            selected={presetIsSelected('dimension')}
            onClick={() => onSelectPreset('dimension')}
            testId="pill-menu-preset-dimension"
          />
          {PRESET_AGGREGATIONS.filter(showPreset).map(agg => (
            <MenuRow
              key={agg}
              label={AGG_LABELS[agg]}
              selected={presetIsSelected(agg)}
              onClick={() => onSelectPreset(agg)}
              testId={`pill-menu-preset-${agg}`}
            />
          ))}
          <Divider />
        </>
      )}

      {/* Index — the post-query slice. Lived in a separate badge before, so
          setting an aggregation and an index meant two different controls.
          "All values" is the default and is deliberately NOT shown on the pill
          itself; only a real index gets a badge. */}
      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Index
      </div>
      <div className="px-3 pb-1.5">
        <select
          value={indexMode}
          onChange={e => selectIndexMode(e.target.value)}
          data-testid="pill-menu-index"
          aria-label="Index"
          className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
        >
          <option value="" disabled={!slicePolicy.all}>
            All values
          </option>
          <option value="[0]" disabled={!slicePolicy.first}>
            First (0)
          </option>
          <option value="[-1]" disabled={!slicePolicy.last}>
            Last (-1)
          </option>
          <option value="at" disabled={!slicePolicy.atRow}>
            At row…
          </option>
          <option value="range" disabled={!slicePolicy.range}>
            Rows…
          </option>
          {/* An already-authored shape this form can't model (e.g. `[0,2,5]`,
              a strided `[0:9:2]`) stays selectable rather than being silently
              rewritten to something else the moment the menu opens. */}
          {indexMode === 'custom' && <option value="custom">{draft.slice}</option>}
        </select>
        {indexMode === 'at' && (
          <input
            type="number"
            value={atRow}
            onChange={e => setIndexAtRow(e.target.value)}
            placeholder="row index"
            data-testid="pill-menu-index-at-row"
            aria-label="Row index"
            className="mt-1 w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
          />
        )}
        {indexMode === 'range' && (
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              value={rangeStart}
              onChange={e => setIndexRange(e.target.value, rangeEnd)}
              placeholder="start"
              data-testid="pill-menu-index-range-start"
              aria-label="First row"
              className="w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
            />
            <span className="flex-shrink-0 text-[11px] text-gray-400">to</span>
            <input
              type="number"
              value={rangeEnd}
              onChange={e => setIndexRange(rangeStart, e.target.value)}
              placeholder="end"
              data-testid="pill-menu-index-range-end"
              aria-label="Last row"
              className="w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-primary-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Modifier — trailing SQL, applied INSIDE the `?{ }` so an index can
          still follow it (`?{ sum(x) / 100 }[0]`). This is what keeps a
          modified expression a pill instead of dropping it to raw text. */}
      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Modifier
      </div>
      <div className="px-3 pb-2">
        <input
          type="text"
          value={draft.modifier}
          onChange={e => setDraft(d => ({ ...d, modifier: e.target.value }))}
          placeholder="/ 100"
          data-testid="pill-menu-modifier"
          aria-label="Modifier"
          className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs font-mono text-gray-800 placeholder:text-gray-300 focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          data-testid="pill-menu-cancel"
          className="rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          // A column-backed pill with no column serializes to a dangling ref,
          // so Apply stays inert until there is one to commit.
          disabled={isColumnBacked && !draft.column}
          title={
            isColumnBacked && !draft.column ? 'Choose a dimension first' : undefined
          }
          data-testid="pill-menu-apply"
          className="rounded bg-primary-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
      <Divider />

      <button
        type="button"
        role="menuitem"
        onClick={onManualEdit}
        data-testid="pill-menu-manual-edit"
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-primary-50 text-gray-700"
      >
        <PiTextAa size={13} />
        Manually edit field…
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!saveAsMetricEnabled}
        title={saveAsMetricEnabled ? undefined : 'Only an aggregate pill can be saved as a metric'}
        onClick={saveAsMetricEnabled ? onSaveAsMetric : undefined}
        data-testid="pill-menu-save-as-metric"
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
          saveAsMetricEnabled
            ? 'hover:bg-primary-50 text-gray-700'
            : 'text-gray-300 cursor-not-allowed'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full border text-center leading-3 text-[9px] ${
            saveAsMetricEnabled ? 'border-primary-400 text-primary-600' : 'border-gray-300'
          }`}
        >
          Σ
        </span>
        Save as metric…
      </button>
      {/* ux-audit.md "Save-as-metric flow is solid but 'Save as metric'
          disabled state gives no visible reason" — a native `title` only
          shows on hover, and the pill's aggregate state was chosen two menus
          ago, so a Dimension pill's disabled item read as unexplained. A
          visible line, not just a tooltip. */}
      {!saveAsMetricEnabled && (
        <p
          data-testid="pill-menu-save-as-metric-disabled-hint"
          className="px-3 pb-1 text-[10px] leading-snug text-gray-400"
        >
          Only an aggregate pill (SUM, AVG, …) can be saved as a metric.
        </p>
      )}
      <Divider />
      <button
        type="button"
        role="menuitem"
        onClick={onRemove}
        data-testid="pill-menu-remove"
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-highlight-50 text-highlight-600"
      >
        <PiTrash size={13} />
        Remove
      </button>
    </div>
  );
};

export default PillMenu;
