import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PiTrash, PiCode, PiSliders } from 'react-icons/pi';
import RefTextArea from '../RefTextArea';
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
}) {
  const queryStringSupported = useMemo(() => supportsQueryString(schema), [schema]);
  const slotShape = useMemo(() => getSlotShape(schema, defs), [schema, defs]);
  const slotPolicy = useMemo(() => menuPolicyFor(slotShape), [slotShape]);

  // DnD drop target (only when droppable + query-string supported)
  const dropEnabled = droppable && queryStringSupported;
  const { isOver, setNodeRef } = useDroppable({
    id: `property-${path}`,
    data: { path, type: 'property-zone', schema },
    disabled: !dropEnabled,
  });

  const isQueryMode = useMemo(() => isQueryStringValue(value), [value]);
  const [forceQueryMode, setForceQueryMode] = useState(() => isQueryStringValue(value));

  // Auto-enter query mode when value externally changes to ?{...} (e.g., chart load, DnD drop)
  useEffect(() => {
    if (isQueryStringValue(value) && !forceQueryMode) {
      setForceQueryMode(true);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticSchema = useMemo(() => getStaticSchema(schema, defs), [schema, defs]);
  const fieldType = useMemo(() => resolveFieldType(schema, defs), [schema, defs]);
  const FieldComponent = getFieldComponent(fieldType);

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

  // Slice badge is rendered when ALL of:
  //  - The current value is a `?{...}` query-string (a chip is present
  //    or the user is mid-typing a query). Static primitives never
  //    show the badge.
  //  - The user is in query mode (the chip editor is the active widget).
  //  - The slot is one we can produce labels for. Unknown slots stay
  //    bare so we don't show a slicing UI for things we don't classify.
  // We also keep the badge visible when a slice is already authored
  // even if the body is empty, so the user can clear it.
  const showSliceBadge =
    currentMode === 'query' &&
    isQueryFormValue &&
    (!!body || !!slice) &&
    slotShape !== 'unknown';

  return (
    <div
      ref={dropEnabled ? setNodeRef : undefined}
      className={`flex flex-col gap-1.5 p-2.5 rounded-md transition-all duration-150 ${
        isDropTarget
          ? 'bg-primary-50 ring-2 ring-primary-300'
          : 'bg-gray-50 hover:bg-gray-100'
      }`}
      data-testid={droppable ? `droppable-property-${path}` : undefined}
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
              disabled={disabled}
              onClick={() => handleModeChange('static')}
              className={`p-1 transition-colors ${
                currentMode === 'static'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Static value"
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
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <RefTextArea
                value={body}
                onChange={handleQueryChange}
                label=""
                rows={2}
                helperText={description}
                disabled={disabled}
                allowedTypes={['model', 'dimension', 'metric', 'input']}
              />
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
      </div>
    </div>
  );
}

export default PropertyRow;
