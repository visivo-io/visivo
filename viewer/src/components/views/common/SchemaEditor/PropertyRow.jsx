import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { PiTrash, PiCode, PiSliders } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import RefTextArea from '../RefTextArea';
import FieldPill from '../FieldPill';
import PillMenu from '../PillMenu';
import * as pillGrammar from '../pillGrammar';
import { useWorkspaceDrag } from '../../workspace/WorkspaceDndContext';
import {
  isQueryStringValue,
  parseQueryString,
  serializeQueryString,
} from '../../../../utils/queryString';
import { supportsQueryString, getStaticSchema } from './utils/schemaUtils';
import { resolveFieldType } from './utils/fieldResolver';
import { getSlotShape, menuPolicyFor } from './utils/slotShape';
import { getFieldComponent } from './fields/fields';
import { SliceBadge } from './SliceBadge';
import { SliceBanner } from './SliceBanner';

/**
 * PropertyRow - A single property in the schema editor with optional query-string toggle
 *
 * Holds `body` and `slice` as separate local state so an authored
 * value like `?{${ref(model).field}}[0]` round-trips cleanly through
 * the chip editor + slice badge without ever putting brackets inside
 * the chip body. See specs/plan/v1-final-bugfixes/B13-* and
 * `~/.claude/plans/warm-tickling-quail.md` for the design.
 *
 * @param {object} props
 * @param {string} props.path - Dot-separated property path (e.g., "marker.color")
 * @param {any} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {function} props.onRemove - Handler to remove this property
 * @param {object} props.schema - The JSON schema for this property
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.description - Property description
 * @param {boolean} props.disabled - Whether the field is disabled
 * @param {boolean} props.droppable - Whether this row is a DnD drop target
 * @param {(dragData: object) => void} [props.onDropField] - Explore 2.0
 *   Phase 3b (S5 §1/§2): per-slot drop callback, mirroring the `pivot-field`
 *   shelf pattern (`PivotShelf.jsx`'s `onDropField`) rather than resolving
 *   against a single global "active insight" — every `PropertyRow` handles
 *   its OWN drop independent of which/how-many sibling rows are also
 *   droppable. Only meaningful when `droppable` is true; the caller (the
 *   Build rail's per-insight section) builds the ref expression from the
 *   drag payload and calls its own `onChange`.
 * @param {string} props.error - Optional inline validation message (AJV) for this path
 * @param {(pillState: object) => void} [props.onSaveAsMetric] - Explore 2.0
 *   Phase 4 (06 §4): enables PillMenu's "Save as metric…" action for this
 *   slot's CURRENT pill state (only meaningful for `kind: 'aggregate'`
 *   pills — PillMenu itself gates on that). Undefined everywhere except the
 *   Build rail's `InsightBuildSection`, which owns the actual promote flow
 *   (name prompt, collision + aggregate-ness checks, `saveMetric`, slot
 *   swap, match-and-replace dedup offer) — mirrors `onDropField`'s identical
 *   "undefined by default, wired only where it's meaningful" convention.
 */
export function PropertyRow({
  path,
  value,
  onChange,
  onRemove,
  schema,
  defs = {},
  description,
  disabled = false,
  droppable = false,
  onDropField,
  onSaveAsMetric,
  error,
}) {
  const queryStringSupported = useMemo(() => supportsQueryString(schema), [schema]);
  const slotShape = useMemo(() => getSlotShape(schema, defs), [schema, defs]);
  const slotPolicy = useMemo(() => menuPolicyFor(slotShape), [slotShape]);

  // DnD drop target (only when droppable + query-string supported).
  // D8/D10 (Explore 2.0 Phase 3b, S5 §1): the data key is `kind`, not `type`
  // — matching every OTHER zone kind in `WorkspaceDndContext`'s router
  // (`ref-slot`/`erd-canvas`/`pivot-field`/`canvas-drop` all discriminate on
  // `kind`). `onDropField` rides on the droppable data itself (the
  // `pivot-field` pattern) so the router hands the drop straight back to
  // THIS row without any "which insight is active" indirection.
  const dropEnabled = droppable && queryStringSupported;
  const { isOver, setNodeRef } = useDroppable({
    id: `property-${path}`,
    data: { path, kind: 'property-zone', schema, onDropField },
    disabled: !dropEnabled,
  });

  // T4 (cold-start #3 / pills-buildrail #4): highlight EVERY eligible slot
  // the instant a compatible drag starts, not just the one under the
  // cursor — `isOver`-only feedback means a user gets no signal about WHERE
  // they can drop until they're already hovering the exact right pixel.
  const activeDrag = useWorkspaceDrag();
  const isDragEligibleForThisRow =
    dropEnabled && !!activeDrag && ['library', 'column', 'pill'].includes(activeDrag.kind);

  const isQueryMode = useMemo(() => isQueryStringValue(value), [value]);
  // T4 (promote-roundtrip #4 / pills #9): a droppable, query-capable slot
  // (the Build rail's x/y "Essentials" fields) defaults to "Static value" —
  // a bare `<input type="number">` — even though dropping/typing a column
  // ref is the overwhelming use case. Typing a ref into that number input
  // silently mangles it character-by-character (observed: '?{query_1.X}'
  // reduced to 'e1'). Default droppable + query-capable EMPTY slots to query
  // mode instead; the toggle above still lets someone who genuinely wants a
  // literal static value switch to it explicitly. Non-droppable consumers
  // (right-rail InsightEditForm/ChartEditForm/SchemaLeafForm) are unaffected
  // — `droppable` is false there, matching every other gate in this file.
  const [forceQueryMode, setForceQueryMode] = useState(
    () => isQueryStringValue(value) || (droppable && queryStringSupported)
  );

  // Auto-enter query mode when value externally changes to ?{...} (e.g., chart load, DnD drop)
  useEffect(() => {
    if (isQueryStringValue(value) && !forceQueryMode) {
      setForceQueryMode(true);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticSchema = useMemo(() => getStaticSchema(schema, defs), [schema, defs]);
  const fieldType = useMemo(() => resolveFieldType(schema, defs), [schema, defs]);
  const FieldComponent = getFieldComponent(fieldType);

  // D8/D10 pill rendering (Explore 2.0 Phase 3b, S5 §3): a recognized
  // expression renders as a typed `<FieldPill>` (+`<PillMenu>` for
  // dimension<->aggregate toggling) instead of the raw `RefTextArea` chip
  // editor. Deliberately GATED ON `droppable` rather than made universal —
  // `droppable` is already the signal that distinguishes the new exploration
  // Build rail from every pre-existing `PropertyRow` consumer (right-rail
  // InsightEditForm/ChartEditForm, canvas item edit forms, SchemaLeafForm —
  // all pass `droppable=false`/omit it, mirroring S5 §2's identical
  // reasoning for the DnD wiring itself: turning this on everywhere is a
  // reasonable follow-up, but doing it here would silently change untested
  // surfaces this phase's gate doesn't cover). `RefTextArea` remains the
  // fallback for opaque/custom expressions on the Build rail too — this is
  // additive, not a replacement.
  const metrics = useStore(s => s.metrics);
  const dimensions = useStore(s => s.dimensions);
  const models = useStore(s => s.models);
  const explorerModelStates = useStore(s => s.explorerModelStates);
  const pillFieldOpts = useMemo(() => {
    const toField = f => ({
      name: f.name,
      parentModel: f.parentModel || (typeof f.config?.model === 'string' ? f.config.model : null),
    });
    // Bug #1 (computed-metric-treated-as-dimension): a scratch computed column
    // added in the Explorer is a model-scoped metric/dimension that never
    // reaches the project-level `metrics`/`dimensions` lists, so `parse()`
    // classified `${ref(model).avg_total}` as a bare-column DIMENSION and the
    // pill mislabeled a metric. Fold each model's `computedColumns` (already
    // typed metric/dimension, carrying their parent model) into the field lists
    // so the pill classifies — and labels — them correctly. Safe: metricRef/
    // dimensionRef pills don't expose the preset toggle (PillMenu gates it on
    // `isColumnBacked`), so this never triggers a serialize round-trip.
    const computedMetricFields = [];
    const computedDimensionFields = [];
    Object.entries(explorerModelStates || {}).forEach(([modelName, s]) => {
      (s?.computedColumns || []).forEach(c => {
        if (!c?.name) return;
        const field = { name: c.name, parentModel: modelName };
        if (c.type === 'metric') computedMetricFields.push(field);
        else if (c.type === 'dimension') computedDimensionFields.push(field);
      });
    });
    // Array.isArray, not just truthy — some consumers' test doubles mock the
    // WHOLE store module to a fixed non-array object regardless of selector
    // (e.g. SchemaLeafForm.test.jsx's `default: () => mockActions`), and this
    // computation runs unconditionally (hooks can't be gated on `droppable`).
    return {
      metricFields: [
        ...(Array.isArray(metrics) ? metrics.map(toField) : []),
        ...computedMetricFields,
      ],
      dimensionFields: [
        ...(Array.isArray(dimensions) ? dimensions.map(toField) : []),
        ...computedDimensionFields,
      ],
      // VIS-1242: lets a bare `${ref(model)}` parse as an UNBOUND pill (a model
      // was dropped, no property chosen yet) instead of opaque. Draft explorer
      // models count — a scratch query is the common thing to drop.
      modelNames: [
        ...(Array.isArray(models) ? models.map(m => m?.name).filter(Boolean) : []),
        ...Object.keys(explorerModelStates || {}),
      ],
    };
  }, [metrics, dimensions, models, explorerModelStates]);
  const pillFieldOptsRef = useRef(pillFieldOpts);
  pillFieldOptsRef.current = pillFieldOpts;

  // Escape hatch back to raw-text editing ("Manually edit field…", 06 §4/§5) —
  // per-row local state so switching one pill to raw edit never affects its
  // siblings. Resets whenever the row's OWN path changes (a different field
  // entirely) so a stale escape-hatch flag can't leak across fields.
  const [forceRawEdit, setForceRawEdit] = useState(false);
  useEffect(() => {
    setForceRawEdit(false);
  }, [path]);

  // Parsed body/slice from the current value. parseQueryString returns
  // null when the value isn't `?{...}` shaped; in that case the value
  // is a static primitive (an enum pick like "number", a typed color
  // hex, etc.) and should NOT participate in the slice flow at all.
  const parsed = useMemo(() => parseQueryString(value), [value]);
  const isQueryFormValue = parsed !== null;
  const body = parsed ? parsed.body : (typeof value === 'string' ? value : '');
  const slice = parsed ? parsed.slice : null;

  // One-time banner state: shown when an array-producing chip is freshly
  // dropped into a scalar-only slot AND we auto-applied the default
  // slice. Dismissed on any banner action OR when the user opens the
  // slice menu via the badge.
  const [bannerActive, setBannerActive] = useState(false);

  // Track whether the prior value was a `?{...}` query-string form.
  // The default slice + banner only fire on the transition from
  // non-query (empty / static / chip-less) to query (chip dropped or
  // a query-string typed). Static primitives like clicking "number" in
  // a flag-string enum must NOT trip this.
  const prevWasQueryRef = useRef(isQueryFormValue);

  useEffect(() => {
    const justBecameQuery = !prevWasQueryRef.current && isQueryFormValue;
    if (justBecameQuery && body && slotShape === 'scalar-only' && !slice) {
      // Auto-apply the slot's default slice and surface the banner
      // (one-time per fresh drop).
      const def = slotPolicy.defaultSlice;
      if (def) {
        onChange(serializeQueryString({ body, slice: def }));
        setBannerActive(true);
      }
    }
    // Banner is for query-form values only. If the value drops back to
    // a non-query primitive (or empty), dismiss it.
    if (!isQueryFormValue || !body) {
      setBannerActive(false);
    }
    prevWasQueryRef.current = isQueryFormValue;
  }, [
    isQueryFormValue,
    body,
    slice,
    slotShape,
    slotPolicy.defaultSlice,
    onChange,
  ]);

  const handleModeChange = (newMode) => {
    setForceQueryMode(newMode === 'query');
  };

  const handleChange = (newValue) => {
    onChange(newValue);
  };

  const handleQueryChange = useCallback(
    newBody => {
      // Preserve the slice across body edits.
      onChange(serializeQueryString({ body: newBody, slice }));
    },
    [onChange, slice]
  );

  const handleSliceChange = useCallback(
    newSlice => {
      onChange(serializeQueryString({ body, slice: newSlice }));
      setBannerActive(false);
    },
    [onChange, body]
  );

  const handleBannerPickFirst = () => handleSliceChange('[0]');
  const handleBannerPickLast = () => handleSliceChange('[-1]');
  const handleBannerPickCustom = () => {
    // Open the menu via the badge — banner dismisses on next slice
    // change. We can't programmatically open the badge from here
    // without a ref dance, so just dismiss the banner; the user clicks
    // the badge themselves (visually obvious next to the chip).
    setBannerActive(false);
  };

  const currentMode = forceQueryMode || isQueryMode ? 'query' : 'static';

  const isDropTarget = isOver && dropEnabled;

  // T4 (pills-buildrail #10): clicking the PILL BODY opens the same menu the
  // chevron does — the chevron's 16px hit target was the ONLY interactive
  // affordance on the pill, failing Fitts and discoverability.
  const pillMenuRef = useRef(null);
  const handlePillBodyClick = useCallback(() => {
    pillMenuRef.current?.open();
  }, []);
  const handlePillBodyKeyDown = useCallback(e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pillMenuRef.current?.open();
    }
  }, []);

  // VIS-1242: a dropped model lands as an UNBOUND pill, and the thing the user
  // must do next is pick a property — so open the editor for them. Keyed on the
  // value CHANGING into that state, so an insight loaded with an unbound ref
  // doesn't pop a menu on every mount.
  const prevValueRef = useRef(value);
  useEffect(() => {
    const changed = prevValueRef.current !== value;
    prevValueRef.current = value;
    if (!changed) return;
    const parsedNow = pillGrammar.parse(
      parseQueryString(value)?.body ?? '',
      pillFieldOptsRef.current
    );
    if (parsedNow.kind === 'modelRef') pillMenuRef.current?.open();
  }, [value]);

  const pillState = useMemo(
    () => pillGrammar.parse(body, pillFieldOpts),
    [body, pillFieldOpts]
  );

  // VIS-1240: whether this value CAN render as a pill — a pure function of the
  // parsed value.
  const pillEligible =
    isQueryFormValue && pillState.kind !== 'opaque' && pillState.kind !== 'custom';

  // VIS-1240 (flip #1 — mid-typing). `pillEligible` is re-derived from the LIVE
  // text on every keystroke, so typing an expression by hand used to swap the
  // editor out from under the caret the instant a partial string happened to
  // parse (`${ref(q).gdp}`), then swap back on the next character (` / 100`).
  // While the raw editor holds focus the representation is frozen: the user is
  // mid-thought, and re-deciding is what loses their cursor.
  const [rawEditing, setRawEditing] = useState(false);
  const handleRawFocus = useCallback(() => setRawEditing(true), []);
  const handleRawBlur = useCallback(e => {
    // Focus moving WITHIN the editor (to its "+ add ref" button, the mention
    // dropdown) still fires focusout — only a real exit ends the edit.
    if (!e.currentTarget.contains(e.relatedTarget)) setRawEditing(false);
  }, []);

  // VIS-1240 (flip #2 — async field tables). `pillFieldOpts` is built from
  // `s.metrics`/`s.dimensions`, which start `[]`, so a bare `?{${ref(name)}}`
  // parses as `opaque` until those lists arrive — it painted as raw code and
  // then jumped to a pill (or back, if a refetch emptied them). Hold the last
  // decision while a fetch is in flight instead of re-deciding on data that is
  // still moving.
  const fieldTablesLoading = useStore(s => !!s.metricsLoading || !!s.dimensionsLoading);
  const lastEligibleRef = useRef(pillEligible);
  if (!fieldTablesLoading) lastEligibleRef.current = pillEligible;
  const stablePillEligible = fieldTablesLoading ? lastEligibleRef.current : pillEligible;

  const showPill =
    currentMode === 'query' &&
    stablePillEligible &&
    !forceRawEdit &&
    !rawEditing;

  // D3 (e2e-gap-review.md delta pass): "Manually edit field…" is otherwise a
  // ONE-WAY RATCHET into raw-text mode — `forceRawEdit` is only ever reset
  // by the `useEffect` above, keyed on `path` (stable for the row's whole
  // mount), so even retyping the EXACT original recognized shape (e.g.
  // `sum(${ref(q).amount})`, which `pillGrammar.parse` reclassifies as a
  // clean `aggregate` pill) left the slot stuck in raw text until an
  // unrelated remount. `pillState` already re-parses the CURRENT raw body
  // on every change regardless of `forceRawEdit` (it only gates whether the
  // pill RENDERS, not whether it's computed) — so whenever the user is in
  // raw-edit mode AND the current text re-parses as a recognized, non-
  // opaque/custom shape, offer an explicit, safe way back: a pure view-mode
  // toggle that never mutates the underlying value (the raw text is already
  // valid; `onClick` just flips `forceRawEdit` back to `false` so the SAME
  // value renders as a pill instead of text).
  //
  // The `droppable` gate that used to be here made that escape hatch reachable
  // ONLY in the Build rail. VIS-1240 removed the same gate from `showPill`, so
  // every other surface (the right rail included) renders pills but had no way
  // back from raw text: "Manually edit field…" swapped the interactive pill for
  // a RefTextArea whose ref chips carry no menu, permanently. Dropping is what
  // `droppable` governs; whether a value can RENDER as a pill is a property of
  // the value, and so is whether it can render as one again.
  const canReturnToPill = currentMode === 'query' && forceRawEdit && pillEligible;

  const pillType =
    pillState.kind === 'modelRef'
      ? 'model'
      : pillState.kind === 'aggregate' || pillState.kind === 'metricRef'
        ? 'metric'
        : 'dimension';
  const pillBaseLabel =
    pillState.kind === 'modelRef'
      ? `${pillState.ref} ▸ choose a dimension`
      : pillState.kind === 'aggregate'
      ? `${(pillState.agg || '').toUpperCase()} · ${pillState.ref} ▸ ${pillState.column}`
      : pillState.kind === 'dimension'
        ? `${pillState.ref} ▸ ${pillState.column}`
        : pillState.ref;

  // The pill claims to BE the expression, so it has to show all of it. The
  // modifier and the index are both authored inside the pill's own editor and
  // then rendered nowhere on it — `sum(gdp) / 100 }[0]` and a bare `sum(gdp)`
  // were the same green chip. Suffix them in serialization order (modifier
  // inside the braces, index outside and last) so the label reads like the
  // string it generates. `slice` already carries its own brackets.
  // An unbound `modelRef` has neither yet, so it keeps its bare prompt.
  const pillSuffix =
    pillState.kind === 'modelRef'
      ? ''
      : `${pillState.modifier ? ` ${pillState.modifier}` : ''}${slice || ''}`;
  const pillLabel = `${pillBaseLabel}${pillSuffix}`;

  // T4 (pills-buildrail #4): the whole pill is a drag SOURCE too, so it can
  // move between slots (drag the x pill onto the y slot), not just receive
  // drops. `sourcePath` + `raw` (the parsed body, pre-`?{}`-wrap) are all
  // the target slot needs — see `handleDropField`'s `source === 'pill'`
  // branch and `WorkspaceDndContext`'s matching router extension. Only
  // wired up when a pill is actually showing (`showPill`) — an opaque/
  // raw-edit row has no pill to drag.
  const {
    attributes: pillDragAttributes,
    listeners: pillDragListeners,
    setNodeRef: setPillDragRef,
    isDragging: isPillDragging,
  } = useDraggable({
    id: `pill-${path}`,
    data: { source: 'pill', sourcePath: path, raw: body, label: pillLabel },
    disabled: !showPill,
  });

  // VIS-1241: ONE commit for everything the pill editor changed — property,
  // aggregation, modifier and index land in a single `onChange`. Previously
  // each preset click committed on its own and the index was a separate
  // control, so a two-part edit wrote the value twice.
  const handlePillApply = useCallback(
    ({ useAs, column, modifier, slice: nextSlice }) => {
      const trimmedModifier = (modifier || '').trim();
      const base =
        useAs === 'dimension'
          ? { kind: 'dimension', ref: pillState.ref, column }
          : { kind: 'aggregate', agg: useAs, ref: pillState.ref, column };
      // A metric/dimension REF pill has no model/column of its own — keep its
      // kind and ref, and let the modifier ride along.
      const nextState =
        pillState.kind === 'metricRef' || pillState.kind === 'dimensionRef'
          ? { kind: pillState.kind, ref: pillState.ref }
          : base;
      if (trimmedModifier) nextState.modifier = trimmedModifier;
      onChange(
        serializeQueryString({
          body: pillGrammar.serialize(nextState),
          slice: nextSlice || null,
        })
      );
    },
    [pillState, onChange]
  );

  const handlePillRemove = useCallback(() => {
    handleQueryChange('');
  }, [handleQueryChange]);

  // Slice badge is rendered when ALL of:
  //  - The current value is a `?{...}` query-string (a chip is present
  //    or the user is mid-typing a query). Static primitives never
  //    show the badge.
  //  - The user is in query mode (the chip editor is the active widget).
  //  - The slot is one we can produce labels for. Unknown slots stay
  //    bare so we don't show a slicing UI for things we don't classify.
  // We also keep the badge visible when a slice is already authored
  // even if the body is empty, so the user can clear it.
  // VIS-1241: only shown for a NON-DEFAULT index. Every query slot used to
  // carry an "All values" badge — the default state, restated on every row,
  // next to every pill. An index is now set from inside the pill's own editor,
  // and the badge appears only once there is a real index to show (and to
  // clear).
  // ...and once the pill itself renders the index, the badge beside it is the
  // same fact stated twice. Keep the badge only where there is no pill to carry
  // it (raw-text / opaque values), where it stays the sole way to see and clear
  // a slice.
  const showSliceBadge =
    currentMode === 'query' && isQueryFormValue && !!slice && slotShape !== 'unknown' && !showPill;

  return (
    <div
      ref={dropEnabled ? setNodeRef : undefined}
      className={`flex flex-col gap-1.5 p-2.5 rounded-md transition-all duration-150 ${
        isDropTarget
          ? 'bg-primary-50 ring-2 ring-primary-300'
          : isDragEligibleForThisRow
            ? 'bg-primary-50/40 ring-2 ring-dashed ring-primary-200'
            : 'bg-gray-50 hover:bg-gray-100'
      }`}
      data-testid={droppable ? `droppable-property-${path}` : undefined}
      data-drag-eligible={isDragEligibleForThisRow ? 'true' : undefined}
    >
      {/* Header row with path, toggle, and remove button */}
      <div className="flex items-center gap-1.5">
        {/* Property path */}
        <span className="flex-1 text-xs font-medium font-mono text-gray-700 truncate">
          {path}
        </span>

        {/* Query-string toggle (only if supported) */}
        {queryStringSupported && (
          <div className="flex rounded-md border border-gray-300 overflow-hidden" role="group">
            <button
              type="button"
              aria-label="static value"
              aria-pressed={currentMode === 'static'}
              // VIS-1240 (flip #3): this button used to lie. `currentMode` is
              // `forceQueryMode || isQueryMode`, so with a `?{...}` value
              // stored, clicking "static" cleared the override but `isQueryMode`
              // held the row in query mode — the button visibly depressed and
              // snapped straight back. It CAN'T demote: a `?{...}` string in a
              // static number input mangles character-by-character. So say why
              // instead of pretending: an expression must be cleared first.
              disabled={disabled || isQueryMode}
              title={
                isQueryMode
                  ? 'Clear the expression to use a static value'
                  : 'Static value'
              }
              onClick={() => handleModeChange('static')}
              className={`p-1 transition-colors ${
                currentMode === 'static'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <PiSliders size={14} />
            </button>
            <button
              type="button"
              aria-label="query string"
              aria-pressed={currentMode === 'query'}
              disabled={disabled}
              onClick={() => handleModeChange('query')}
              className={`p-1 border-l border-gray-300 transition-colors ${
                currentMode === 'query'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Query expression"
            >
              <PiCode size={14} />
            </button>
          </div>
        )}

        {/* Remove button */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="remove property"
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove property"
          >
            <PiTrash size={14} />
          </button>
        )}
      </div>

      {/* Field input */}
      <div>
        {currentMode === 'query' || (queryStringSupported && !staticSchema) ? (
          // flex-wrap so the slice badge drops to a new line in narrow
          // property panels (the right-side editor is ~300px in many
          // layouts) instead of overflowing past the panel edge.
          //
          // `min-w-0` (not `min-w-[180px]`): a flex item's default
          // `min-width: auto` refuses to shrink narrower than its content's
          // own intrinsic width, which silently defeated FieldPill's
          // `truncate` on the label — a long ref name (a bound source like
          // `local-duckdb_query`, or any name a user picks) just grew this
          // whole row instead of ellipsizing, eventually pushing the pill's
          // trailing "extra" content (PillMenu's own chevron trigger) behind
          // the adjacent SliceBadge instead of next to it. `flex-1` already
          // gives this column room to grow up to the available space;
          // `min-w-0` is what lets it also shrink and hand off to
          // `truncate` once the content is longer than that — paired with
          // the matching `min-w-0` chain inside `FieldPill.jsx` itself
          // (its own docstring has the full chain; a fix at only one level
          // still leaves the pill unable to actually shrink).
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-0">
              {showPill ? (
                <FieldPill
                  ref={setPillDragRef}
                  type={pillType}
                  label={pillLabel}
                  data-testid={`property-pill-${path}`}
                  // T4 (pills-buildrail #4/#10): the pill is both a drag
                  // SOURCE (move it to another slot) and a click target
                  // (open the same menu the chevron does) — the chevron's
                  // 16px hit target was previously the ONLY interactive
                  // affordance. `role="button"`/`tabIndex` keep it keyboard-
                  // reachable without turning the pill into a real `<button>`
                  // (PillMenu's own chevron trigger is a REAL button nested
                  // inside; two real buttons would be invalid HTML nesting).
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onClick={disabled ? undefined : handlePillBodyClick}
                  onKeyDown={disabled ? undefined : handlePillBodyKeyDown}
                  {...pillDragAttributes}
                  {...pillDragListeners}
                  className={`${isPillDragging ? 'opacity-50' : ''} cursor-grab active:cursor-grabbing`}
                  // Delta-review fix (HIGH): a dangling ref (e.g. its query
                  // chip was deleted, or the model it names no longer
                  // resolves) must render as an explicit warning pill, never
                  // a silently-healthy-looking one — `error` is this row's
                  // advisory `checkRefTargets` verdict (02-architecture.md §2),
                  // already computed one level up; previously it only ever
                  // rendered as easy-to-miss text below the pill.
                  warning={!!error}
                  warningMessage={error}
                  extra={
                    <PillMenu
                      ref={pillMenuRef}
                      state={pillState}
                      slice={slice}
                      // Drives which index options the menu offers — a
                      // scalar-only prop can't take a range, an array-only
                      // one can't take a single row.
                      slotShape={slotShape}
                      onApply={handlePillApply}
                      onManualEdit={() => setForceRawEdit(true)}
                      onSaveAsMetric={
                        onSaveAsMetric ? () => onSaveAsMetric(pillState) : undefined
                      }
                      onRemove={handlePillRemove}
                      disabled={disabled}
                    />
                  }
                />
              ) : (
                <>
                  {/* VIS-1240: the focus wrapper is what freezes pill-vs-text
                      while the user is typing. React's onFocus/onBlur are
                      focusin/focusout, so they catch focus anywhere inside —
                      no prop changes to RefTextArea, which 8+ surfaces share. */}
                  <div
                    onFocus={handleRawFocus}
                    onBlur={handleRawBlur}
                    data-testid={`property-${path}-raw-editor`}
                  >
                    <RefTextArea
                      value={body}
                      onChange={handleQueryChange}
                      label=""
                      rows={2}
                      helperText={description}
                      disabled={disabled}
                      allowedTypes={['model', 'dimension', 'metric', 'input']}
                      // Raw-text mode has no pill to drop onto, and outside the
                      // Build rail the row wrapper isn't a drop target either.
                      acceptDrops
                      // "Manually edit field…" means the WHOLE expression is
                      // text, refs included — a chip there is the one part the
                      // manual escape hatch can't edit. An opaque value the
                      // user never opted into editing keeps its chips.
                      plainRefs={forceRawEdit}
                      restrictBrackets={!forceRawEdit}
                    />
                  </div>
                  {canReturnToPill && (
                    <button
                      type="button"
                      onClick={() => setForceRawEdit(false)}
                      disabled={disabled}
                      data-testid={`property-${path}-back-to-pill`}
                      title="This expression matches a recognized shape again — switch back to the pill view."
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ◂ Back to pill
                    </button>
                  )}
                </>
              )}
            </div>
            {showSliceBadge && (
              <div className="flex-shrink-0 mt-1">
                <SliceBadge
                  slice={slice}
                  onChange={handleSliceChange}
                  slotShape={slotShape}
                />
              </div>
            )}
          </div>
        ) : (
          <FieldComponent
            value={value}
            onChange={handleChange}
            schema={fieldType === 'patternMultiselect' ? schema : staticSchema || schema}
            defs={defs}
            label=""
            description={description}
            disabled={disabled}
          />
        )}

        {bannerActive && currentMode === 'query' && (
          <SliceBanner
            onPickFirst={handleBannerPickFirst}
            onPickLast={handleBannerPickLast}
            onPickCustom={handleBannerPickCustom}
            onDismiss={() => setBannerActive(false)}
          />
        )}

        {error && (
          <p
            className="mt-1 text-xs font-medium text-highlight-600"
            data-testid={`property-error-${path}`}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default PropertyRow;
