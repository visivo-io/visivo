import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPlus } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import useStore from '../../stores/store';
import { selectInsightStatus } from '../../stores/explorerNewStore';
import { CHART_TYPES, getSchema } from '../../schemas/schemas';
import { getRequiredFields } from '../new-views/common/insightRequiredFields';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';
import { flattenSchemaProperties } from '../new-views/common/SchemaEditor/utils/schemaUtils';
import RefTextArea from '../new-views/common/RefTextArea';
import PropertyFilter from './PropertyFilter';
import { getEssentialsForChartType } from './chartTypeEssentials';

const PROPERTY_FILTER_STORAGE_PREFIX = 'visivo_property_filter_mode_';

const readPersistedFilterMode = (insightType) => {
  if (typeof window === 'undefined' || !window.localStorage) return 'essentials';
  try {
    const stored = window.localStorage.getItem(`${PROPERTY_FILTER_STORAGE_PREFIX}${insightType}`);
    return stored === 'all' ? 'all' : 'essentials';
  } catch (_e) {
    return 'essentials';
  }
};

const persistFilterMode = (insightType, mode) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${PROPERTY_FILTER_STORAGE_PREFIX}${insightType}`, mode);
  } catch (_e) {
    // localStorage write failures (quota, private mode) are non-fatal
  }
};

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
    <div
      data-testid={`insight-interaction-${index}`}
      className="flex items-center gap-2"
    >
      <select
        data-testid={`interaction-type-select-${index}`}
        value={interaction.type || 'filter'}
        onChange={(e) => {
          updateInsightInteraction(insightName, index, { type: e.target.value });
        }}
        className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white"
      >
        {INTERACTION_TYPES.map((it) => (
          <option key={it.value} value={it.value}>
            {it.label}
          </option>
        ))}
      </select>
      <div
        ref={setNodeRef}
        className={`flex-1 ${isOver ? 'ring-2 ring-primary-400 rounded' : ''}`}
        data-testid={`interaction-value-field-${index}`}
      >
        <RefTextArea
          value={innerValue}
          onChange={(newVal) => {
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
        className="text-gray-400 hover:text-red-500 transition-colors"
      >
        <PiX size={12} />
      </button>
    </div>
  );
};

const INTERACTION_TYPES = [
  { value: 'filter', label: 'Filter' },
  { value: 'split', label: 'Split' },
  { value: 'sort', label: 'Sort' },
];

const InsightCRUDSection = ({ insightName, isExpanded, onToggleExpand }) => {
  const insightState = useStore(
    (s) => s.explorerInsightStates?.[insightName]
  );
  const setInsightType = useStore((s) => s.setInsightType);
  const setInsightProp = useStore((s) => s.setInsightProp);
  const removeInsightProp = useStore((s) => s.removeInsightProp);
  const removeInsightFromChart = useStore((s) => s.removeInsightFromChart);
  const addInsightInteraction = useStore((s) => s.addInsightInteraction);
  const removeInsightInteraction = useStore((s) => s.removeInsightInteraction);
  const updateInsightInteraction = useStore((s) => s.updateInsightInteraction);
  const setActiveInsight = useStore((s) => s.setActiveInsight);
  const renameInsight = useStore((s) => s.renameInsight);
  const restorePropsFromCache = useStore((s) => s.restorePropsFromCache);

  const [schema, setSchema] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const status = useStore(selectInsightStatus(insightName));

  const type = insightState?.type || 'scatter';
  const props = insightState?.props || {};
  const interactions = insightState?.interactions || [];

  const [filterMode, setFilterMode] = useState(() => readPersistedFilterMode(type));

  // Resync filterMode when the chart type changes (e.g., user switches scatter -> bar).
  // Each chart type has its own persisted preference.
  useEffect(() => {
    setFilterMode(readPersistedFilterMode(type));
  }, [type]);

  const handleFilterModeChange = useCallback(
    (newMode) => {
      setFilterMode(newMode);
      persistFilterMode(type, newMode);
    },
    [type]
  );

  const essentialPaths = useMemo(() => getEssentialsForChartType(type), [type]);

  const allPropertyPaths = useMemo(() => {
    if (!schema) return [];
    const defs = schema.$defs || {};
    return flattenSchemaProperties(schema, '', defs)
      .filter((p) => p.path !== 'type')
      .map((p) => p.path);
  }, [schema]);

  const totalPropertyCount = allPropertyPaths.length;

  const availableEssentialPaths = useMemo(() => {
    if (!schema) return essentialPaths;
    const allowed = new Set(allPropertyPaths);
    return essentialPaths.filter((p) => allowed.has(p));
  }, [schema, essentialPaths, allPropertyPaths]);

  const essentialPropertyCount = availableEssentialPaths.length;

  useEffect(() => {
    let cancelled = false;
    getSchema(type).then((s) => {
      if (!cancelled) {
        setSchema(s);
        // Restore cached prop values that are valid for this type's schema
        // Use ALL property paths (including nested like marker.color) for precise matching
        if (s) {
          const defs = s.$defs || {};
          const allProps = flattenSchemaProperties(s, '', defs);
          const validPaths = allProps.map((p) => p.path).filter((p) => p !== 'type');
          restorePropsFromCache(insightName, validPaths);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [type, insightName, restorePropsFromCache]);

  const requiredFieldNames = useMemo(() => {
    return getRequiredFields(type).map((f) => f.name);
  }, [type]);

  const handleTypeChange = useCallback(
    (e) => {
      setInsightType(insightName, e.target.value);
    },
    [insightName, setInsightType]
  );

  const handleSchemaChange = useCallback(
    (newValue) => {
      if (!newValue || typeof newValue !== 'object') return;

      const currentProps = useStore.getState().explorerInsightStates?.[insightName]?.props || {};

      const allKeys = new Set([...Object.keys(currentProps), ...Object.keys(newValue)]);
      for (const key of allKeys) {
        if (key in newValue) {
          if (newValue[key] !== currentProps[key]) {
            setInsightProp(insightName, key, newValue[key]);
          }
        } else {
          removeInsightProp(insightName, key);
        }
      }
    },
    [insightName, setInsightProp, removeInsightProp]
  );

  const handleHeaderClick = useCallback(() => {
    setActiveInsight(insightName);
    onToggleExpand();
  }, [insightName, setActiveInsight, onToggleExpand]);

  const handleRemove = useCallback(
    (e) => {
      e.stopPropagation();
      removeInsightFromChart(insightName);
    },
    [insightName, removeInsightFromChart]
  );

  const handleToggle = useCallback(
    (e) => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleAddInteraction = useCallback(() => {
    addInsightInteraction(insightName, { type: 'filter', value: '' });
  }, [insightName, addInsightInteraction]);

  const handleRemoveInteraction = useCallback(
    (index) => {
      removeInsightInteraction(insightName, index);
    },
    [insightName, removeInsightInteraction]
  );

  const [renameError, setRenameError] = useState(null);

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
      data-testid={`insight-crud-section-${insightName}`}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
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
              onChange={(e) => {
                setRenameValue(e.target.value);
                if (renameError) setRenameError(null);
              }}
              onBlur={() => commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenameError(null);
                  setIsRenaming(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={`text-sm font-medium text-purple-800 bg-white border rounded px-1 py-0 outline-none focus:ring-1 ${
                renameError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-purple-300 focus:ring-purple-400'
              }`}
            />
            {renameError && (
              <span
                data-testid={`insight-rename-error-${insightName}`}
                className="text-xs text-red-600 mt-0.5"
              >
                {renameError}
              </span>
            )}
          </span>
        ) : (
          <span
            className="text-sm font-medium text-purple-800 truncate flex-1 cursor-pointer"
            data-testid={`insight-name-${insightName}`}
            onClick={(e) => {
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
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
        >
          <PiX size={14} />
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-purple-400">
          {/* Type Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              data-testid={`insight-type-select-${insightName}`}
              value={type}
              onChange={handleTypeChange}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition-colors"
            >
              {CHART_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Properties (SchemaEditor) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Properties</label>
              {schema && (
                <PropertyFilter
                  totalCount={totalPropertyCount}
                  essentialCount={essentialPropertyCount}
                  mode={filterMode}
                  onChange={handleFilterModeChange}
                />
              )}
            </div>
            <SchemaEditor
              schema={schema}
              value={props}
              onChange={handleSchemaChange}
              excludeProperties={['type']}
              initiallyExpanded={requiredFieldNames}
              droppable={true}
              filterToKeys={filterMode === 'essentials' ? availableEssentialPaths : null}
              hidePropertyCount={true}
            />
          </div>

          {/* Interactions */}
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
    </div>
  );
};

export default InsightCRUDSection;
