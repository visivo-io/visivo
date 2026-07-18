import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiCaretDown, PiWarningCircle, PiTextAa, PiTrash } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeColors, getTypeIcon } from './objectTypeConfigs';
import { PRESET_AGGREGATIONS, isMedianSupported } from './pillGrammar';
import { parseRefValue } from '../../../utils/refString';
import { inferColumnTypes } from '../../../utils/inferColumnTypes';

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
 * Fails open (`undefined` -> full preset list) for duckdb/unresolved,
 * mirroring `SchemaLeafForm.jsx`'s exact resolution + fail-open contract.
 */
function usePillDialect(state) {
  const models = useStore(s => s.models);
  const sources = useStore(s => s.sources);
  const metrics = useStore(s => s.metrics);
  const dimensions = useStore(s => s.dimensions);

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
    const sourceRef = model?.config?.source ?? model?.source;
    const sourceName = sourceRef ? parseRefValue(sourceRef) : null;
    const src = (sources || []).find(s => s.name === sourceName || s.source_name === sourceName);
    const t = (src?.type || src?.config?.type || '').toLowerCase();
    if (!t || t === 'duckdb') return undefined;
    return t === 'postgresql' ? 'postgres' : t;
  }, [state, models, sources, metrics, dimensions]);
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
 * Phase 3b scope is PRESETS-ONLY (S5 §5 item 6): dimension ↔ preset
 * aggregation toggling, dialect-gated MEDIAN, "Custom aggregation…" (switches
 * the slot back to raw `RefTextArea` editing — reuses the existing widget,
 * 06 §5), and a preflight warning for the global-name-first ref-collision
 * case. "Save as metric…" always renders disabled — its flow (server-side
 * aggregate validation, name-collision UX, dedup offers) is Phase 4.
 *
 * @param {object} props
 * @param {object} props.state - a `pillGrammar.parse()` result for the
 *   CURRENT slot value.
 * @param {(preset: 'dimension'|string) => void} props.onSelectPreset -
 *   called with `'dimension'` or an aggregation key from
 *   `PRESET_AGGREGATIONS`; the caller rebuilds + serializes the new state.
 * @param {() => void} props.onCustomAggregation - switch this slot to raw
 *   `RefTextArea` editing, pre-filled with the current body.
 * @param {() => void} props.onRemove - clear this slot's value.
 * @param {boolean} [props.disabled]
 */
const PillMenu = ({ state, onSelectPreset, onCustomAggregation, onRemove, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const isColumnBacked = state?.kind === 'dimension' || state?.kind === 'aggregate';
  const isNumeric = useColumnIsNumeric(isColumnBacked ? state.ref : null, state?.column);
  const dialect = usePillDialect(state);
  const medianAllowed = isMedianSupported(dialect);

  const hasCollisionWarning = !!(state?.statedModel && state?.resolvedParent);

  const presetIsSelected = preset => {
    if (preset === 'dimension') return state?.kind === 'dimension';
    return state?.kind === 'aggregate' && state?.agg === preset;
  };

  const handleSelect = preset => {
    onSelectPreset?.(preset);
    setOpen(false);
  };

  const menuStyle = useMemo(() => {
    if (!open || !triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 260;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - MENU_WIDTH - 8));
    return { top: rect.bottom + 4, left };
  }, [open]);

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
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
            style={menuStyle}
            onClose={() => setOpen(false)}
            isNumeric={isNumeric}
            medianAllowed={medianAllowed}
            isColumnBacked={isColumnBacked}
            hasCollisionWarning={hasCollisionWarning}
            presetIsSelected={presetIsSelected}
            onSelectPreset={handleSelect}
            onCustomAggregation={() => {
              onCustomAggregation?.();
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
};

const PillMenuPopover = ({
  state,
  style,
  onClose,
  isNumeric,
  medianAllowed,
  isColumnBacked,
  hasCollisionWarning,
  presetIsSelected,
  onSelectPreset,
  onCustomAggregation,
  onRemove,
  triggerRef,
}) => {
  const containerRef = useRef(null);

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
      style={{ top: style.top, left: style.left }}
      data-testid="pill-menu"
      role="menu"
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
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Use as
          </div>
          <MenuRow
            label="Dimension"
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

      <button
        type="button"
        role="menuitem"
        onClick={onCustomAggregation}
        data-testid="pill-menu-custom-aggregation"
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-primary-50 text-gray-700"
      >
        <PiTextAa size={13} />
        Custom aggregation…
      </button>
      <button
        type="button"
        role="menuitem"
        disabled
        title="arrives with promote (Phase 4)"
        data-testid="pill-menu-save-as-metric"
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-gray-300 cursor-not-allowed"
      >
        <span className="inline-block h-3 w-3 rounded-full border border-gray-300 text-center leading-3 text-[9px]">
          Σ
        </span>
        Save as metric…
      </button>
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
