import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { PiMagnifyingGlass, PiWarningCircle, PiX } from 'react-icons/pi';
import TypeSelector from './TypeSelector';
import FieldGroupList from '../workspace/FieldGroupList';
import { getSchema } from '../../../schemas/schemas';
import { loadCatalog, loadTraceGroups } from '../../../schemas/traceCatalogLoader';
import { buildTraceGroupSpec, humanizePath } from './buildTraceGroupSpec';
import { getRequiredFields } from './insightRequiredFields';
import { preserveTraceProps } from './preserveTraceProps';
import { validateProps } from '../../../schemas/plotlyValidator';
import FieldFinderPalette from './fieldFinder/FieldFinderPalette';
import { buildFieldIndex } from './fieldFinder/fieldFinderIndex';
import { setValueAtPath } from './SchemaEditor/utils/schemaUtils';
import { isMacPlatform, isEditableTarget } from '../workspace/useWorkspaceTabShortcuts';

/**
 * TracePropsEditor (VIS-1020)
 *
 * The grouped, schema-driven, AJV-validated editor for an Insight's Plotly trace
 * `props` (the props object carries `.type`). It is fully CONTROLLED — it takes
 * `props` + `onChange` and never owns persistence. The parent wires persistence
 * (e.g. `useRecordSave('insight', name)`); this component is record-agnostic.
 *
 * Composition:
 *  - <TypeSelector> at the top, bound to `props.type`. On a type change it loads
 *    the new per-type schema, runs `preserveTraceProps` (carrying forward the
 *    compatible top-level props + a `typePropsCache` kept across switches), and
 *    emits the next props via `onChange`. Immediate — no modal.
 *  - For the current type it loads schema (schemas.js) + catalog + groups
 *    (traceCatalogLoader), builds a `groupSpec` via `buildTraceGroupSpec`, and
 *    renders it through the shared <FieldGroupList> (PropertyRow widgets).
 *  - AJV inline validation: every props change is validated via `validateProps`;
 *    per-field dot-path errors (line.dash, marker.line.width, …) are threaded to
 *    FieldGroupList → FieldGroup → PropertyRow and an overall invalid indicator
 *    is shown.
 *  - Collapse state per `{ownerName}.{groupId}` persists in localStorage via the
 *    shared field-group collapse store (we override each group's `objectType`
 *    with `ownerName` so collapse is keyed per insight, surviving reload).
 *  - A "🔍 Find fields… (⌘K)" affordance calls the optional `onOpenFieldFinder`
 *    (the palette itself is VIS-1021; this just renders the entry point).
 *
 * @param {object} props
 * @param {string} props.ownerName - insight name; the collapse-persistence key prefix.
 * @param {object} props.props - the insight's Plotly props (includes `.type`).
 * @param {(nextProps: object) => void} props.onChange - controlled change handler.
 * @param {boolean} [props.disabled]
 * @param {() => void} [props.onOpenFieldFinder] - optional ⌘K field-finder opener.
 * @param {(isValid: boolean, errorMap: Object<string,string>) => void} [props.onValidityChange]
 *   - VIS-993 gate wiring: reports every validation outcome so the composing
 *     form can hold its save while the props are invalid.
 * @param {boolean} [props.droppable] - Explore 2.0 Phase 3b (S5 §2): pure
 *   pass-through to `FieldGroupList`/`FieldGroup`/`PropertyRow`, mirroring
 *   `SchemaEditor.jsx`'s existing `droppable` forwarding. Default false — a
 *   no-op for the two pre-existing call sites (`InsightEditForm`/
 *   `ChartEditForm`, both right-rail, non-Explorer forms); only the new
 *   exploration Build rail passes true. Gated deliberately (not universal):
 *   `WorkspaceDndContext` is mounted at the whole Workspace shell, so
 *   flipping this default would make those forms' prop rows real, live drop
 *   targets as an untested side effect of this retrofit.
 * @param {(path: string, dragData: object) => void} [props.onDropField] -
 *   per-field drop callback threaded straight through to `FieldGroupList`.
 * @param {(path: string, pillState: object) => void} [props.onSaveAsMetric] -
 *   Explore 2.0 Phase 4: per-field "Save as metric…" callback threaded
 *   straight through to `FieldGroupList`. Undefined everywhere except the
 *   Build rail's `InsightBuildSection`.
 * @param {Record<string,string>} [props.externalErrors] - Explore 2.0 Phase
 *   3b (02-architecture.md §2's "advisory as-you-type feedback"): an optional
 *   dot-path -> message map from a validation layer OUTSIDE this editor's own
 *   AJV schema check (the Build rail's `checkRefTargets` dangling-ref advisory,
 *   resolved against real store collections UNION the exploration's own
 *   draft.queries). Merged into the same `errors` map FieldGroupList/
 *   PropertyRow already render (red text, never blocking) — a real AJV
 *   invalidity on a path wins over an advisory one if both fire.
 */
const TracePropsEditor = ({
  ownerName,
  props: traceProps,
  onChange,
  disabled = false,
  onOpenFieldFinder,
  onValidityChange,
  droppable = false,
  onDropField,
  onSaveAsMetric,
  externalErrors,
}) => {
  const type = traceProps?.type || '';

  // Per-type prop snapshots stashed across type switches (mirrors the explorer
  // store's typePropsCache). Kept in a ref so it survives re-renders without re-triggering
  // effects, and so a switch-back restores the exact prior snapshot.
  const typePropsCacheRef = useRef({});

  // Loaded artifacts for the CURRENT type.
  const [schema, setSchema] = useState(null);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [groupsMap, setGroupsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // AJV validation: dot-path → message map + overall validity.
  const [errorMap, setErrorMap] = useState({});
  const [isValid, setIsValid] = useState(true);

  // VIS-1021 Field Finder: palette open state + the path currently being
  // revealed (jumped-to) in the grouped form after a compound-result select.
  const [fieldFinderOpen, setFieldFinderOpen] = useState(false);
  const [revealPath, setRevealPath] = useState(null);

  // T4 (pills-buildrail #2): a chart-type switch silently wiped every
  // configured field with no warning ("Build, blind, wipe" — the audit's own
  // words). `preserveTraceProps` already carries forward whatever's
  // COMPATIBLE with the new type (x/y survive scatter->bar); this surfaces
  // what ISN'T — a dismissible, human-readable list of what just got
  // dropped, right where the switch happened.
  const [typeChangeWarning, setTypeChangeWarning] = useState(null); // { fromType, toType, dropped: string[] }

  // Load schema + catalog + groups whenever the type changes.
  useEffect(() => {
    if (!type) {
      setSchema(null);
      setCatalogEntries([]);
      setGroupsMap({});
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([getSchema(type), loadCatalog(type), loadTraceGroups(type)])
      .then(([loadedSchema, loadedCatalog, loadedGroups]) => {
        if (cancelled) return;
        if (!loadedSchema) {
          setLoadError(`Failed to load schema for ${type}`);
          setSchema(null);
        } else {
          setSchema(loadedSchema);
        }
        setCatalogEntries(Array.isArray(loadedCatalog) ? loadedCatalog : []);
        setGroupsMap(loadedGroups && typeof loadedGroups === 'object' ? loadedGroups : {});
      })
      .catch(err => {
        if (cancelled) return;
        console.error(`TracePropsEditor: failed to load artifacts for ${type}`, err);
        setLoadError(`Failed to load schema for ${type}`);
        setSchema(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type]);

  // Report validity to the composing form (VIS-993) without retriggering the
  // validation effect on parent re-renders — the callback lives in a ref.
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => {
    onValidityChangeRef.current = onValidityChange;
  }, [onValidityChange]);

  // Re-run AJV validation on every props change (and once the validator can resolve
  // a schema for the type). Errors are mapped to a dot-path → message lookup.
  useEffect(() => {
    if (!type) {
      setErrorMap({});
      setIsValid(true);
      onValidityChangeRef.current?.(true, {});
      return;
    }

    let cancelled = false;
    validateProps(type, traceProps || {})
      .then(result => {
        if (cancelled) return;
        const map = {};
        (result.errors || []).forEach(({ path, message }) => {
          // Keep the first error per path; root-level errors live under '' (shown
          // by the overall indicator).
          if (path && !(path in map)) map[path] = message;
        });
        setErrorMap(map);
        setIsValid(!!result.valid);
        onValidityChangeRef.current?.(!!result.valid, map);
      })
      .catch(err => {
        if (cancelled) return;
        // Validation could not run (e.g. schema compile error). Don't silently
        // claim the props are valid — surface it so a real failure isn't masked
        // (VIS-1020 review). Treat as non-blocking (no field errors) but logged.
        // eslint-disable-next-line no-console
        console.warn(`TracePropsEditor: prop validation failed for type "${type}":`, err);
        setErrorMap({});
        setIsValid(true);
        onValidityChangeRef.current?.(true, {});
      });

    return () => {
      cancelled = true;
    };
  }, [type, traceProps]);

  // Build the ordered group spec, then re-key each group's collapse persistence to
  // the OWNER (insight) rather than the chart type, so collapse is remembered per
  // insight. The "Key fields (<type>)" title still derives from the chart type.
  //
  // buildTraceGroupSpec's own `expanded` flag is `!!required || present` —
  // required per the Plotly JSON SCHEMA (structural), not "the field a user
  // needs to fill in to get a chart" (semantic). Plotly's schema doesn't mark
  // x/y required for scatter/bar/etc, so on a BRAND NEW insight (empty props)
  // they'd stay hidden behind the group's "+N more" toggle — the retired
  // `InsightCRUDSection` avoided this by passing `initiallyExpanded={
  // getRequiredFields(type).map(f => f.name)}` straight to `SchemaEditor`.
  // `TracePropsEditor` has no equivalent knob, so force those same
  // semantically-required paths (`insightRequiredFields.js` — the single
  // source of truth both this and the old code read) open here, regardless
  // of the schema-required/present computation. This is a general fix (every
  // TracePropsEditor consumer benefits, not just the exploration Build rail).
  const groupSpec = useMemo(() => {
    if (!schema) return [];
    const spec = buildTraceGroupSpec({
      type,
      schema,
      catalogEntries,
      groupsMap,
      value: traceProps || {},
    });
    const alwaysExpandPaths = new Set(getRequiredFields(type).map(f => f.name));
    return spec.map(group => ({
      ...group,
      objectType: ownerName || group.objectType,
      fields: (group.fields || []).map(field =>
        alwaysExpandPaths.has(field.name) && !field.expanded
          ? { ...field, expanded: true }
          : field
      ),
    }));
  }, [schema, type, catalogEntries, groupsMap, traceProps, ownerName]);

  // FieldGroupList edits a value object WITHOUT `type`; re-attach the current type
  // so the controlled props always carry their discriminator.
  const handleFieldsChange = useCallback(
    nextProps => {
      if (!onChange) return;
      onChange({ ...nextProps, type });
    },
    [onChange, type]
  );

  // Type switch: load the new schema, preserve compatible props, emit immediately.
  const handleTypeChange = useCallback(
    async newType => {
      if (!newType || newType === type || !onChange) return;

      const newSchema = await getSchema(newType);
      const { props: nextProps, typePropsCache, dropped } = preserveTraceProps({
        oldProps: traceProps || {},
        oldType: type,
        newType,
        newSchema: newSchema || {},
        typePropsCache: typePropsCacheRef.current,
      });
      typePropsCacheRef.current = typePropsCache;
      setTypeChangeWarning(dropped && dropped.length > 0 ? { fromType: type, toType: newType, dropped } : null);
      onChange(nextProps);
    },
    [type, traceProps, onChange]
  );

  const handleOpenFieldFinder = useCallback(() => {
    // Let a host override the opener if it wants to own the palette; otherwise
    // open the built-in one.
    if (onOpenFieldFinder) onOpenFieldFinder();
    else setFieldFinderOpen(true);
  }, [onOpenFieldFinder]);

  // ⌘K / Ctrl+K opens the Field Finder while this editor is mounted (skipping
  // keystrokes typed into an input/textarea so it never hijacks field entry).
  useEffect(() => {
    if (onOpenFieldFinder) return undefined; // host owns the shortcut too
    const mac = isMacPlatform();
    const onKey = e => {
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K') && !isEditableTarget(e.target)) {
        e.preventDefault();
        setFieldFinderOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenFieldFinder]);

  // The per-type searchable index for the palette. Built LAZILY — only once the
  // palette is actually opened — so the common editor render path never pays the
  // schema-flatten cost (and the index module caches per type across opens).
  const fieldIndex = useMemo(
    () => (fieldFinderOpen && schema ? buildFieldIndex(type, schema, catalogEntries) : []),
    [fieldFinderOpen, schema, type, catalogEntries]
  );

  // Palette inline scalar edit → write the prop straight into the controlled
  // props (re-attaching `type`).
  const handleFieldFinderEdit = useCallback(
    (path, nextValue) => {
      if (!onChange) return;
      const next = setValueAtPath(traceProps || {}, path, nextValue);
      onChange({ ...next, type });
    },
    [onChange, traceProps, type]
  );

  // Palette compound-result select → jump-and-focus that path in the grouped
  // form. Clear the reveal marker after the flash so re-selecting the same path
  // re-triggers the scroll/highlight. The timer is held in a ref and cleared on
  // unmount / re-reveal — a useCallback's return value is discarded, so an
  // inline cleanup would leak the timer (setState after unmount → test flake).
  const revealTimerRef = useRef(null);
  const handleReveal = useCallback(path => {
    setRevealPath(path);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => setRevealPath(null), 1600);
  }, []);
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    []
  );

  return (
    <div className="flex flex-col gap-3" data-testid="trace-props-editor">
      {/* Type selector + overall validity indicator. D12 (grounding
          diagnosis #4): this is now the ONLY chart-type control on the Build
          rail — the legacy top-level `Type` <Select> InsightBuildSection
          used to render alongside it was a byte-for-byte duplicate and is
          deleted. `ownerName`-scoped testid so a Build rail stacking several
          insight sections still has one unambiguous selector per insight. */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <TypeSelector
            value={type}
            onChange={handleTypeChange}
            disabled={disabled}
            data-testid={ownerName ? `type-selector-${ownerName}` : undefined}
          />
        </div>
        {!isValid && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium text-highlight-600"
            data-testid="trace-props-invalid-indicator"
            title="Some properties are invalid"
          >
            <PiWarningCircle size={14} />
            Invalid
          </span>
        )}
      </div>

      {/* T4 (pills-buildrail #2): dismissible warning naming exactly what the
          type switch just dropped — compatible fields (x/y etc.) already
          survive via `preserveTraceProps`; this only fires when something
          genuinely didn't carry over. */}
      {typeChangeWarning && (
        <div
          data-testid="trace-props-type-change-warning"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <PiWarningCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            Switching to <strong>{typeChangeWarning.toType}</strong> dropped{' '}
            {typeChangeWarning.dropped.length === 1 ? 'this field' : 'these fields'} not supported
            on that chart type:{' '}
            <strong>{typeChangeWarning.dropped.map(humanizePath).join(', ')}</strong>.
          </span>
          <button
            type="button"
            onClick={() => setTypeChangeWarning(null)}
            aria-label="Dismiss"
            data-testid="trace-props-type-change-warning-dismiss"
            className="flex-shrink-0 text-amber-500 hover:text-amber-700"
          >
            <PiX size={12} />
          </button>
        </div>
      )}

      {/* Field finder affordance (palette is VIS-1021; this is just the entry point) */}
      <button
        type="button"
        onClick={handleOpenFieldFinder}
        disabled={disabled}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="trace-props-field-finder"
      >
        <span className="flex items-center gap-1.5">
          <PiMagnifyingGlass size={14} />
          Find fields…
        </span>
        <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-white border border-gray-200 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Body: loading / error / grouped fields */}
      {loading ? (
        <div
          className="flex items-center justify-center py-6"
          data-testid="trace-props-loading"
        >
          <CircularProgress size={20} />
          <span className="ml-2 text-sm text-gray-600">Loading fields…</span>
        </div>
      ) : loadError ? (
        <div className="bg-highlight-50 border border-highlight-200 rounded-md p-3">
          <p className="text-sm text-highlight-700">{loadError}</p>
        </div>
      ) : (
        <FieldGroupList
          groupSpec={groupSpec}
          value={traceProps || {}}
          onChange={handleFieldsChange}
          defs={schema?.$defs || {}}
          disabled={disabled}
          errors={externalErrors ? { ...externalErrors, ...errorMap } : errorMap}
          revealPath={revealPath}
          droppable={droppable}
          onDropField={onDropField}
          onSaveAsMetric={onSaveAsMetric}
        />
      )}

      {/* VIS-1021 Field Finder palette (built-in unless a host overrode the opener) */}
      {fieldFinderOpen && !onOpenFieldFinder && (
        <FieldFinderPalette
          type={type}
          entries={fieldIndex}
          value={traceProps || {}}
          onEditScalar={handleFieldFinderEdit}
          onRevealCompound={handleReveal}
          onClose={() => setFieldFinderOpen(false)}
        />
      )}
    </div>
  );
};

export default TracePropsEditor;
