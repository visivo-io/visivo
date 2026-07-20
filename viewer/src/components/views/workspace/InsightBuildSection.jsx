import React, { useState, useCallback, useMemo } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPlus } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import useStore from '../../../stores/store';
import { getSourceDialect, selectInsightStatus } from '../../../stores/explorerStore';
import TracePropsEditor from '../common/TracePropsEditor';
import RefTextArea from '../common/RefTextArea';
import Select from '../../common/Select';
import { checkRefTargets } from './refPreflight';
import { formatRefExpression } from '../../../utils/refString';
import { isNumericColumnType } from '../../../utils/columnType';
import SaveAsMetricPrompt from './SaveAsMetricPrompt';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';
import { saveAsMetric, suggestMetricName } from './saveAsMetricFlow';

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

  const innerValue = (() => {
    const v = interaction.value || '';
    const m = v.match(/^\?\{([\s\S]*)\}$/);
    return m ? m[1] : v;
  })();

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
        <RefTextArea
          value={innerValue}
          onChange={newVal => {
            updateInsightInteraction(insightName, index, {
              value: newVal ? `?{${newVal}}` : '',
            });
          }}
          label=""
          rows={1}
          allowedTypes={['model', 'dimension', 'metric', 'input']}
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

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(null);

  // Explore 2.0 Phase 4 (06 §4): "Save as metric…" prompt state — at most
  // one slot's flow is in progress at a time per insight section.
  const [saveAsMetricTarget, setSaveAsMetricTarget] = useState(null); // {path, pillState}
  const [saveAsMetricSubmitting, setSaveAsMetricSubmitting] = useState(false);
  const [saveAsMetricError, setSaveAsMetricError] = useState(null);
  const [dedupOffers, setDedupOffers] = useState([]);

  const status = useStore(selectInsightStatus(insightName));

  const type = insightState?.type || 'scatter';
  const interactions = insightState?.interactions || [];

  const tracePropsValue = useMemo(
    () => ({ ...(insightState?.props || {}), type }),
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
      let body;
      if (dragData.type === 'metric' || dragData.type === 'dimension') {
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

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== insightName) {
      try {
        renameInsight(insightName, trimmed);
        setRenameError(null);
        setIsRenaming(false);
      } catch (err) {
        if (err?.code === 'NAME_COLLISION') {
          setRenameError(err.message);
          return;
        }
        throw err;
      }
    } else {
      setRenameError(null);
      setIsRenaming(false);
    }
  }, [renameValue, insightName, renameInsight]);

  if (!insightState) return null;

  return (
    <div
      data-testid={`insight-build-section-${insightName}`}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      <div
        data-testid={`insight-header-${insightName}`}
        onClick={handleHeaderClick}
        className="flex items-center gap-2 px-3 py-2 bg-purple-50/50 border-l-4 border-purple-400 cursor-pointer hover:bg-purple-50 transition-colors duration-150"
      >
        <button
          data-testid={`insight-toggle-${insightName}`}
          onClick={handleToggle}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <PiCaretDown size={14} /> : <PiCaretRight size={14} />}
        </button>

        {isRenaming ? (
          <span className="flex-1 flex flex-col">
            <input
              autoFocus
              data-testid={`insight-rename-input-${insightName}`}
              value={renameValue}
              onChange={e => {
                setRenameValue(e.target.value);
                if (renameError) setRenameError(null);
              }}
              onBlur={() => commitRename()}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenameError(null);
                  setIsRenaming(false);
                }
              }}
              onClick={e => e.stopPropagation()}
              className={`text-sm font-medium text-purple-800 bg-white border rounded px-1 py-0 outline-none focus:ring-1 ${
                renameError ? 'border-highlight-400 focus:ring-highlight-400' : 'border-purple-300 focus:ring-purple-400'
              }`}
            />
            {renameError && (
              <span
                data-testid={`insight-rename-error-${insightName}`}
                className="text-xs text-highlight-600 mt-0.5"
              >
                {renameError}
              </span>
            )}
          </span>
        ) : (
          <span
            className="text-sm font-medium text-purple-800 truncate flex-1 cursor-pointer"
            data-testid={`insight-name-${insightName}`}
            onClick={e => {
              e.stopPropagation();
              if (insightState?.isNew) {
                setIsRenaming(true);
                setRenameValue(insightName);
              }
            }}
          >
            {insightName}
          </span>
        )}

        {status && (
          <span
            data-testid={`insight-status-dot-${insightName}`}
            className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'new' ? 'bg-green-500' : 'bg-amber-500'}`}
          />
        )}

        <button
          data-testid={`insight-remove-${insightName}`}
          onClick={handleRemove}
          className="flex-shrink-0 text-gray-400 hover:text-highlight-500 transition-colors"
        >
          <PiX size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-purple-400">
          {/* D12 (grounding diagnosis #4): the legacy top-level Type <Select>
              that used to live here was a byte-for-byte duplicate of
              TracePropsEditor's OWN <TypeSelector> just below — both wrote
              through the same handler and always agreed, so the second
              control was pure confusion ("Type: Scatter/Line" stacked on
              "Properties: Scatter/Line"). Deleted; TracePropsEditor's
              TypeSelector (data-testid `type-selector-${ownerName}`) is now
              the ONLY place type switching happens. */}
          <div>
            <TracePropsEditor
              ownerName={insightName}
              props={tracePropsValue}
              onChange={handleTracePropsChange}
              droppable
              onDropField={handleDropField}
              onSaveAsMetric={handleOpenSaveAsMetric}
              externalErrors={advisoryErrors}
            />
            {dedupOffers.length > 0 && (
              <div className="mt-2">
                <FieldSwapOfferBanner offers={dedupOffers} onDismiss={handleDismissDedupOffer} />
              </div>
            )}
          </div>

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
