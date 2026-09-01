import React, { useState, useRef, useCallback, useMemo } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPlus, PiPencilSimple } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import useStore from '../../../stores/store';
import PanelMenu from '../../common/PanelMenu';
import {
  getSourceDialect,
  selectInsightStatus,
  expandDotNotationProps,
} from '../../../stores/explorerStore';
import InsightEditFormFields from '../common/InsightEditFormFields';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import ExpressionField from '../common/ExpressionField';
import Select from '../../common/Select';
import { checkRefTargets } from './refPreflight';
import { formatRefExpression } from '../../../utils/refString';
import { isNumericColumnType } from '../../../utils/columnType';
import SaveAsMetricPrompt from './SaveAsMetricPrompt';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';
import { saveAsMetric, suggestMetricName } from './saveAsMetricFlow';

const INSIGHT_COLORS = getTypeColors('insight');
const InsightTypeIcon = getTypeIcon('insight');

const INTERACTION_TYPES = [
  { value: 'filter', label: 'Filter' },
  { value: 'split', label: 'Split' },
  { value: 'sort', label: 'Sort' },
];

const InteractionRow = ({ interaction, index, insightName, updateInsightInteraction, handleRemoveInteraction }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `interaction-zone-${insightName}-${index}`,
    data: { type: 'interaction-zone', insightName, index },
  });

  return (
    <div data-testid={`insight-interaction-${index}`} className="flex items-center gap-2">
      <Select
        data-testid={`interaction-type-select-${index}`}
        size="sm"
        className="min-w-[110px]"
        value={interaction.type || 'filter'}
        options={INTERACTION_TYPES}
        onChange={type => {
          updateInsightInteraction(insightName, index, { type });
        }}
      />
      <div
        ref={setNodeRef}
        className={`flex-1 ${isOver ? 'ring-2 ring-primary-400 rounded' : ''}`}
        data-testid={`interaction-value-field-${index}`}
      >
        <ExpressionField
          objectType="interaction"
          field="filter"
          value={interaction.value || ''}
          onChange={newVal => {
            updateInsightInteraction(insightName, index, { value: newVal });
          }}
          label=""
          rows={1}
        />
      </div>
      <button
        data-testid={`insight-remove-interaction-${index}`}
        onClick={() => handleRemoveInteraction(index)}
        className="text-gray-400 hover:text-highlight-500 transition-colors"
      >
        <PiX size={12} />
      </button>
    </div>
  );
};

/**
 * InsightBuildSection — Explore 2.0 Phase 3b (VIS-1059, 02-architecture.md §9
 * "Rebuilt (not restyled)"). Replaces `InsightCRUDSection` on the exploration
 * Build rail: same header/rename/status/type/interactions UX, but the
 * Properties body is REBUILT onto `TracePropsEditor` (schema-driven,
 * type-switch-cached, D8/D10 typed-pill rendering) instead of `SchemaEditor`.
 *
 * Type switching is now owned ENTIRELY by `TracePropsEditor`'s own internal
 * `preserveTraceProps`/`typePropsCacheRef` (it renders its own `TypeSelector`
 * at the top) — the legacy store's separate `typePropsCache`/
 * `restorePropsFromCache` mechanism is superseded for this surface;
 * `setInsightType` is still called (it's the only action that writes
 * `insightState.type`), but immediately followed by re-applying
 * TracePropsEditor's own preserved props on top, so its cache is what wins.
 *
 * Drops (D9/D10): every ref-valued prop slot is a real DnD drop target
 * (`droppable`) via the `property-zone` retrofit — `handleDropField` builds
 * the ref expression from the Library drag payload (metric/dimension object,
 * model column, source-schema column, input) against the exploration's
 * currently ACTIVE scratch query, applying 06 §3's v1 drop-default heuristic
 * (a confidently numeric source column defaults to a SUM aggregate pill;
 * everything else defaults to a plain dimension pill).
 *
 * Advisory validation (02-architecture.md §2): `checkRefTargets` runs against
 * real store collections UNION this exploration's own draft query names (a
 * naive store-only check would falsely flag valid in-draft refs as
 * dangling) — surfaced as non-blocking red text via `TracePropsEditor`'s
 * `externalErrors`, never gating anything (drafts may be invalid; Phase 4's
 * promote gate is where strictness lives).
 */
const InsightBuildSection = ({ insightName, isExpanded, onToggleExpand }) => {
  const insightState = useStore(s => s.explorerInsightStates?.[insightName]);
  const setInsightType = useStore(s => s.setInsightType);
  const setInsightProp = useStore(s => s.setInsightProp);
  const removeInsightProp = useStore(s => s.removeInsightProp);
  const removeInsightFromChart = useStore(s => s.removeInsightFromChart);
  const addInsightInteraction = useStore(s => s.addInsightInteraction);
  const removeInsightInteraction = useStore(s => s.removeInsightInteraction);
  const updateInsightInteraction = useStore(s => s.updateInsightInteraction);
  const setActiveInsight = useStore(s => s.setActiveInsight);
  const renameInsight = useStore(s => s.renameInsight);
  const activeModelName = useStore(s => s.explorerActiveModelName) || 'preview_model';
  const modelTabs = useStore(s => s.explorerModelTabs);
  const modelStates = useStore(s => s.explorerModelStates);
  const sources = useStore(s => s.sources);
  const explorerSources = useStore(s => s.explorerSources);
  const models = useStore(s => s.models);
  const showWorkspaceToast = useStore(s => s.showWorkspaceToast);

  // The name lives in the shared Basic Information field now (editable only for
  // a still-draft insight). `renameValue` buffers keystrokes; the commit fires
  // on blur/Enter. Re-mounts on rename (parent keys by name) reset the buffer.
  const [renameValue, setRenameValue] = useState(insightName);
  const [renameError, setRenameError] = useState(null);
  const nameInputRef = useRef(null);

  // Explore 2.0 Phase 4 (06 §4): "Save as metric…" prompt state — at most
  // one slot's flow is in progress at a time per insight section.
  const [saveAsMetricTarget, setSaveAsMetricTarget] = useState(null); // {path, pillState}
  const [saveAsMetricSubmitting, setSaveAsMetricSubmitting] = useState(false);
  const [saveAsMetricError, setSaveAsMetricError] = useState(null);
  const [dedupOffers, setDedupOffers] = useState([]);

  const status = useStore(selectInsightStatus(insightName));

  const type = insightState?.type || 'scatter';
  const interactions = insightState?.interactions || [];

  // Fields read their value by NESTED path (FieldGroup's getValueAtPath, e.g.
  // `marker.color` -> value.marker.color), but a DROP writes a FLAT dot-key
  // (`setInsightProp` stores props['marker.color']). Without expanding here, a
  // field dropped into any NESTED-path well (marker.color, line.dash, …) read
  // back undefined — the well showed the empty "Type @ to insert a reference"
  // placeholder even though the value was set and the chart rendered. Expand
  // the flat dot-keys so the well displays what was dropped; the store
  // self-heals to nested on the next onChange. Idempotent for already-nested
  // (API-loaded / manually-typed) props.
  const tracePropsValue = useMemo(
    () => ({ ...expandDotNotationProps(insightState?.props || {}), type }),
    [insightState?.props, type]
  );

  // TracePropsEditor's onChange always hands back the FULL props object with
  // `type` re-attached (VIS-1020). A type switch is applied first (the only
  // action that writes `insightState.type`) and immediately overwritten by
  // TracePropsEditor's own already-preserved props for the new type — see
  // the component docstring above.
  const handleTracePropsChange = useCallback(
    nextPropsWithType => {
      if (!nextPropsWithType || typeof nextPropsWithType !== 'object') return;
      const { type: nextType, ...nextProps } = nextPropsWithType;
      const current = useStore.getState().explorerInsightStates?.[insightName];
      if (!current) return;
      if (nextType && nextType !== current.type) {
        setInsightType(insightName, nextType);
      }
      const currentProps = useStore.getState().explorerInsightStates?.[insightName]?.props || {};
      const allKeys = new Set([...Object.keys(currentProps), ...Object.keys(nextProps)]);
      for (const key of allKeys) {
        if (key in nextProps) {
          if (nextProps[key] !== currentProps[key]) {
            setInsightProp(insightName, key, nextProps[key]);
          }
        } else {
          removeInsightProp(insightName, key);
        }
      }
    },
    [insightName, setInsightType, setInsightProp, removeInsightProp]
  );

  // D10 §3 v1 drop-default heuristic + D9 payload resolution (mirrors
  // routeExplorationDragEnd's buildRefExpr, generalized here since this
  // callback OWNS the drop — no global "active insight" indirection).
  //
  // T4 (cold-start #3 / pills-buildrail #1): every drop this handler doesn't
  // act on now says why, via the shared workspace toast — a drop that just
  // does nothing (no pill, no error, no animation) is the single most
  // trust-destroying moment the audit found. `source === 'pill'` (T4,
  // pills-buildrail #4) is the ONE other successful path: a pill dragged
  // out of a sibling slot in the SAME insight section moves (clears the
  // source), rather than rebuilding a ref from a Library/column payload.
  const handleDropField = useCallback(
    (path, dragData) => {
      if (!dragData) return;
      if (dragData.source === 'pill') {
        if (!dragData.sourcePath || !dragData.raw) return;
        if (dragData.sourcePath === path) return; // dropped back on itself — no-op, nothing to warn about
        setInsightProp(insightName, path, `?{${dragData.raw}}`);
        removeInsightProp(insightName, dragData.sourcePath);
        return;
      }
      if (dragData.type === 'sourceTable') {
        showWorkspaceToast?.("Can't drop a whole table here — drag a column instead.");
        return;
      }
      // VIS-1242: an explicit allowlist. Anything with a `name` used to fall
      // into the generic branch below and silently write
      // `?{${ref(<activeModel>).<objectName>}}` — so dropping a SOURCE or an
      // INSIGHT produced a dangling ref with no message at all. The canvas has
      // had a type guard since Phase 3a; property slots never did.
      const DROPPABLE_ON_PROPERTY = ['metric', 'dimension', 'input', 'model', 'sourceColumn', 'column'];
      if (dragData.type && !DROPPABLE_ON_PROPERTY.includes(dragData.type)) {
        showWorkspaceToast?.(`Can't use a ${dragData.type} as a field value.`);
        return;
      }
      let body;
      if (dragData.type === 'model') {
        // Unbound on purpose: the pill opens its editor so the property (and
        // aggregation, index, modifier) get picked there — the same editor a
        // fully-configured pill uses.
        body = formatRefExpression(dragData.name);
      } else if (dragData.type === 'metric' || dragData.type === 'dimension') {
        body = dragData.parentModel
          ? formatRefExpression(dragData.parentModel, dragData.name)
          : formatRefExpression(dragData.name);
      } else if (dragData.type === 'input') {
        const accessor = dragData.inputType === 'multi-select' ? 'values' : 'value';
        body = formatRefExpression(dragData.name, accessor);
      } else if (dragData.name) {
        const columnRef = formatRefExpression(activeModelName, dragData.name);
        body =
          dragData.type === 'sourceColumn' && isNumericColumnType(dragData.columnType)
            ? `sum(${columnRef})`
            : columnRef;
      } else {
        // Unrecognized drag payload — never fail silently.
        showWorkspaceToast?.("Can't drop that here.");
        return;
      }
      setInsightProp(insightName, path, `?{${body}}`);
    },
    [activeModelName, insightName, setInsightProp, removeInsightProp, showWorkspaceToast]
  );

  // Explore 2.0 Phase 4 (06 §4): opens the name-prompt for a slot's
  // aggregate pill. `PillMenu` (via `PropertyRow`) only calls this for
  // `kind: 'aggregate'` states — see `saveAsMetricFlow.js` for the flow.
  const handleOpenSaveAsMetric = useCallback((path, pillState) => {
    setSaveAsMetricError(null);
    setSaveAsMetricTarget({ path, pillState });
  }, []);

  const handleCancelSaveAsMetric = useCallback(() => {
    setSaveAsMetricTarget(null);
    setSaveAsMetricError(null);
  }, []);

  // Resolves the source dialect governing the pill's model — the SAME
  // promoted-model-first, draft-fallback resolution `PillMenu.usePillDialect`
  // uses for the MEDIAN gate, generalized here since this runs OUTSIDE a
  // hook (inside an event handler, not render).
  const resolveSourceDialect = useCallback(
    modelName => {
      const model = (models || []).find(m => m.name === modelName);
      if (model) {
        const sourceRef = model?.config?.source ?? model?.source;
        const sourceName = sourceRef ? sourceRef.replace(/^ref\(([^)]+)\)$/, '$1') : null;
        const src = (sources || []).find(
          s => s.name === sourceName || s.source_name === sourceName
        );
        const t = (src?.type || src?.config?.type || '').toLowerCase();
        if (t) return t === 'postgresql' ? 'postgres' : t;
      }
      const draftSourceName = modelStates?.[modelName]?.sourceName;
      return getSourceDialect(draftSourceName, explorerSources) || undefined;
    },
    [models, sources, modelStates, explorerSources]
  );

  const handleSubmitSaveAsMetric = useCallback(
    async name => {
      if (!saveAsMetricTarget) return;
      setSaveAsMetricSubmitting(true);
      setSaveAsMetricError(null);
      const result = await saveAsMetric({
        pillState: saveAsMetricTarget.pillState,
        name,
        insightName,
        path: saveAsMetricTarget.path,
        sourceDialect: resolveSourceDialect(saveAsMetricTarget.pillState.ref),
        getState: () => useStore.getState(),
      });
      setSaveAsMetricSubmitting(false);
      if (!result.success) {
        setSaveAsMetricError(result.error);
        return;
      }
      setSaveAsMetricTarget(null);
      if (result.dedupOffer) {
        setDedupOffers(prev => [...prev, result.dedupOffer]);
      }
    },
    [saveAsMetricTarget, insightName, resolveSourceDialect]
  );

  const handleDismissDedupOffer = useCallback(index => {
    setDedupOffers(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Advisory ref-target check (02 §2): real store collections UNION this
  // exploration's own scratch query names, so a valid in-draft ref (a
  // `?{${ref(orders_q).x}}` where `orders_q` is a not-yet-promoted scratch
  // query) is never falsely flagged as dangling.
  const advisoryErrors = useMemo(() => {
    const state = useStore.getState();
    const draftQueryStubs = (modelTabs || []).map(name => ({ name }));
    const syntheticState = { ...state, models: [...(state.models || []), ...draftQueryStubs] };
    const result = checkRefTargets(tracePropsValue, syntheticState);
    if (result.valid || result.skipped) return {};
    const map = {};
    (result.errors || []).forEach(({ path, message }) => {
      if (path && !(path in map)) map[path] = message;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracePropsValue, modelTabs]);

  const handleHeaderClick = useCallback(() => {
    setActiveInsight(insightName);
    onToggleExpand();
  }, [insightName, setActiveInsight, onToggleExpand]);

  const handleRemove = useCallback(
    e => {
      e.stopPropagation();
      removeInsightFromChart(insightName);
    },
    [insightName, removeInsightFromChart]
  );

  const handleToggle = useCallback(
    e => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleAddInteraction = useCallback(() => {
    addInsightInteraction(insightName, { type: 'filter', value: '' });
  }, [insightName, addInsightInteraction]);

  const handleRemoveInteraction = useCallback(
    index => {
      removeInsightInteraction(insightName, index);
    },
    [insightName, removeInsightInteraction]
  );

  // The ⋮ "Rename" action: make sure the pane is expanded (so the field is
  // mounted) and focus/select the Basic Information name input.
  const startRename = useCallback(() => {
    setActiveInsight(insightName);
    setRenameValue(insightName);
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [insightName, setActiveInsight]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === insightName) {
      setRenameError(null);
      setRenameValue(insightName);
      return;
    }
    try {
      renameInsight(insightName, trimmed);
      setRenameError(null);
    } catch (err) {
      if (err?.code === 'NAME_COLLISION') {
        setRenameError(err.message);
        return;
      }
      throw err;
    }
  }, [renameValue, insightName, renameInsight]);

  if (!insightState) return null;

  return (
    <div
      data-testid={`insight-build-section-${insightName}`}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* VIS-1224: neutral collapsible header (the colored side-bar is gone —
          the body now renders the same standard edit panel as the RightRail).
          The header carries only the pane's identity + controls; the editable
          name lives in the Basic Information field below. */}
      <div
        data-testid={`insight-header-${insightName}`}
        onClick={handleHeaderClick}
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-150"
      >
        <button
          data-testid={`insight-toggle-${insightName}`}
          onClick={handleToggle}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <PiCaretDown size={14} /> : <PiCaretRight size={14} />}
        </button>

        {/* VIS-1224: SelectionChip-style identity (type icon + name + TYPE),
            matching the standard RightRail edit-panel header. */}
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${INSIGHT_COLORS.bg} ${INSIGHT_COLORS.text} ${INSIGHT_COLORS.border}`}
        >
          {InsightTypeIcon && <InsightTypeIcon style={{ fontSize: 14 }} />}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-[13px] font-semibold text-secondary-900"
            data-testid={`insight-name-${insightName}`}
            title={insightName}
          >
            {insightName}
          </span>
          <span className="truncate text-[10.5px] uppercase tracking-wide text-gray-400">
            Insight
          </span>
        </div>

        {status && (
          <span
            data-testid={`insight-status-dot-${insightName}`}
            className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'new' ? 'bg-green-500' : 'bg-amber-500'}`}
          />
        )}

        {/* Rename only applies to a still-draft insight — a promoted/loaded
            insight's inline rename is VIS-1209's project-wide ${ref()} rewrite,
            out of scope here (matches `renameInsight`'s own `isNew` guard). */}
        <PanelMenu
          testId={`insight-${insightName}`}
          ariaLabel={`Options for ${insightName}`}
          items={[
            {
              id: 'rename',
              label: 'Rename',
              icon: PiPencilSimple,
              disabled: !insightState?.isNew,
              onSelect: startRename,
            },
          ]}
        />

        <button
          data-testid={`insight-remove-${insightName}`}
          onClick={handleRemove}
          className="flex-shrink-0 text-gray-400 hover:text-highlight-500 transition-colors"
        >
          <PiX size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Shared edit panel (VIS-1224) — the same Basic Information +
              Visualization Props the standard InsightEditForm renders. Name is
              editable only for a still-draft insight; committing renames the
              draft (renameInsight rewrites sibling refs). The Explorer threads
              its property-zone DnD + Save-as-metric into the shared props
              editor; type switching stays owned by TracePropsEditor's own
              TypeSelector (`type-selector-${insightName}`). */}
          <InsightEditFormFields
            showName
            nameId={`insight-name-field-${insightName}`}
            nameValue={renameValue}
            onNameChange={e => {
              setRenameValue(e.target.value);
              if (renameError) setRenameError(null);
            }}
            onNameBlur={commitRename}
            onNameKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                setRenameError(null);
                setRenameValue(insightName);
              }
            }}
            nameDisabled={!insightState?.isNew}
            nameError={renameError}
            nameErrorTestId={`insight-rename-error-${insightName}`}
            nameInputRef={nameInputRef}
            nameTestId={`insight-rename-input-${insightName}`}
            showDescription={false}
            ownerName={insightName}
            props={tracePropsValue}
            onPropsChange={handleTracePropsChange}
            droppable
            onDropField={handleDropField}
            onSaveAsMetric={handleOpenSaveAsMetric}
            externalErrors={advisoryErrors}
          />

          {dedupOffers.length > 0 && (
            <FieldSwapOfferBanner offers={dedupOffers} onDismiss={handleDismissDedupOffer} />
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interactions</label>
            <div className="space-y-2">
              {interactions.map((interaction, index) => (
                <InteractionRow
                  key={index}
                  interaction={interaction}
                  index={index}
                  insightName={insightName}
                  updateInsightInteraction={updateInsightInteraction}
                  handleRemoveInteraction={handleRemoveInteraction}
                />
              ))}
            </div>
            <button
              data-testid={`insight-add-interaction-${insightName}`}
              onClick={handleAddInteraction}
              className="flex items-center gap-1 mt-2 text-xs text-purple-600 hover:text-purple-800 transition-colors"
            >
              <PiPlus size={12} />
              Add Interaction
            </button>
          </div>
        </div>
      )}
      {saveAsMetricTarget && (
        <SaveAsMetricPrompt
          suggestedName={suggestMetricName(saveAsMetricTarget.pillState)}
          onSubmit={handleSubmitSaveAsMetric}
          onCancel={handleCancelSaveAsMetric}
          submitting={saveAsMetricSubmitting}
          error={saveAsMetricError}
        />
      )}
    </div>
  );
};

export default InsightBuildSection;
