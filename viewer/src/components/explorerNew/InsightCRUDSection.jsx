import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPlus } from 'react-icons/pi';
import useStore from '../../stores/store';
import { selectInsightStatus } from '../../stores/explorerNewStore';
import { CHART_TYPES, getSchema } from '../../schemas/schemas';
import { getRequiredFields } from '../new-views/common/insightRequiredFields';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';
import RefTextArea from '../new-views/common/RefTextArea';

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

  const [schema, setSchema] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const status = useStore(selectInsightStatus(insightName));

  const type = insightState?.type || 'scatter';
  const props = insightState?.props || {};
  const interactions = insightState?.interactions || [];

  useEffect(() => {
    let cancelled = false;
    getSchema(type).then((s) => {
      if (!cancelled) setSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

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

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== insightName) {
      renameInsight(insightName, trimmed);
    }
    setIsRenaming(false);
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
          <input
            autoFocus
            data-testid={`insight-rename-input-${insightName}`}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium text-purple-800 bg-white border border-purple-300 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-purple-400 flex-1"
          />
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Properties</label>
            <SchemaEditor
              schema={schema}
              value={props}
              onChange={handleSchemaChange}
              excludeProperties={['type']}
              initiallyExpanded={requiredFieldNames}
              droppable={true}
            />
          </div>

          {/* Interactions */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interactions</label>
            <div className="space-y-2">
              {interactions.map((interaction, index) => (
                <div
                  key={index}
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
                  <div className="flex-1" data-testid={`interaction-value-field-${index}`}>
                    <RefTextArea
                      value={(() => {
                        const v = interaction.value || '';
                        const m = v.match(/^\?\{([\s\S]*)\}$/);
                        return m ? m[1] : v;
                      })()}
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
