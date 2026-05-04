import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PiCaretDown, PiCaretRight, PiPlus, PiX } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';
import useStore from '../../stores/store';
import { selectInsightStatus } from '../../stores/explorerNewStore';
import { getSchema } from '../../schemas/schemas';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';
import { flattenSchemaProperties } from '../new-views/common/SchemaEditor/utils/schemaUtils';
import PropertyFilter from './PropertyFilter';
import { getLayoutEssentials } from './chartTypeEssentials';

const LAYOUT_FILTER_STORAGE_KEY = 'visivo_property_filter_mode_layout';

const readLayoutFilterMode = () => {
  if (typeof window === 'undefined' || !window.localStorage) return 'essentials';
  try {
    const stored = window.localStorage.getItem(LAYOUT_FILTER_STORAGE_KEY);
    return stored === 'all' ? 'all' : 'essentials';
  } catch (_e) {
    return 'essentials';
  }
};

const persistLayoutFilterMode = (mode) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LAYOUT_FILTER_STORAGE_KEY, mode);
  } catch (_e) {
    // localStorage write failures are non-fatal
  }
};

const InsightPillItem = ({ name, isActive, onRemove, onClick }) => {
  const status = useStore(selectInsightStatus(name));
  return (
    <span data-testid={`chart-insight-pill-${name}`}>
      <EmbeddedPill
        objectType="insight"
        label={name}
        isActive={isActive}
        onClick={onClick}
        onRemove={onRemove}
        statusDot={status}
      />
    </span>
  );
};

const ChartCRUDSection = ({ isExpanded, onToggleExpand }) => {
  const isLoadedChart = useStore((s) => (s.charts || []).some((c) => c.name === s.explorerChartName));
  const chartName = useStore((s) => s.explorerChartName);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const setChartName = useStore((s) => s.setChartName);
  const replaceChartLayout = useStore((s) => s.replaceChartLayout);
  const createInsight = useStore((s) => s.createInsight);
  const removeInsightFromChart = useStore((s) => s.removeInsightFromChart);
  const setActiveInsight = useStore((s) => s.setActiveInsight);
  const closeChart = useStore((s) => s.closeChart);

  const [layoutSchema, setLayoutSchema] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [layoutFilterMode, setLayoutFilterMode] = useState(() => readLayoutFilterMode());
  const skipNextCommitRef = useRef(false);

  const handleLayoutFilterModeChange = useCallback((newMode) => {
    setLayoutFilterMode(newMode);
    persistLayoutFilterMode(newMode);
  }, []);

  const layoutEssentialPaths = useMemo(() => getLayoutEssentials(), []);

  const allLayoutPropertyPaths = useMemo(() => {
    if (!layoutSchema) return [];
    const defs = layoutSchema.$defs || {};
    return flattenSchemaProperties(layoutSchema, '', defs).map((p) => p.path);
  }, [layoutSchema]);

  const totalLayoutPropertyCount = allLayoutPropertyPaths.length;

  const availableLayoutEssentialPaths = useMemo(() => {
    if (!layoutSchema) return layoutEssentialPaths;
    const allowed = new Set(allLayoutPropertyPaths);
    return layoutEssentialPaths.filter((p) => allowed.has(p));
  }, [layoutSchema, layoutEssentialPaths, allLayoutPropertyPaths]);

  const essentialLayoutPropertyCount = availableLayoutEssentialPaths.length;

  // Keep the local editing value in sync with the chart name when we're not
  // actively typing, so switching charts updates the displayed text.
  useEffect(() => {
    if (!isEditing) {
      setRenameValue(chartName || 'Untitled');
      setRenameError(null);
    }
  }, [chartName, isEditing]);

  const { setNodeRef: setInsightDropRef, isOver: isInsightOver } = useDroppable({
    id: 'chart-insight-zone',
    data: { type: 'insight-zone' },
  });

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then((s) => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLayoutChange = useCallback(
    (newValue) => {
      if (!newValue || typeof newValue !== 'object') return;
      replaceChartLayout(newValue);
    },
    [replaceChartLayout]
  );

  const handleAddInsight = useCallback(() => {
    createInsight();
  }, [createInsight]);

  const handleRemoveInsight = useCallback(
    (e, name) => {
      e.stopPropagation();
      removeInsightFromChart(name);
    },
    [removeInsightFromChart]
  );

  const handleInsightClick = useCallback(
    (name) => {
      setActiveInsight(name);
    },
    [setActiveInsight]
  );

  const handleToggle = useCallback(
    (e) => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleClose = useCallback(
    (e) => {
      e.stopPropagation();
      closeChart?.();
    },
    [closeChart]
  );

  const commitRename = useCallback(() => {
    // Escape handler sets this to cancel the onBlur commit that immediately
    // follows .blur(). Without this, commitRename reads stale renameValue
    // before React flushes Escape's state resets.
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    setIsEditing(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === (chartName || 'Untitled') || trimmed === 'Untitled') {
      setRenameError(null);
      setRenameValue(chartName || 'Untitled');
      return;
    }
    try {
      setChartName(trimmed);
      setRenameError(null);
    } catch (err) {
      if (err?.code === 'NAME_COLLISION') {
        setRenameError(err.message);
        // Stay in editing mode so the user can correct
        setIsEditing(true);
        return;
      }
      throw err;
    }
  }, [renameValue, chartName, setChartName]);

  return (
    <div
      data-testid="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Header — name integrated, matching insight pattern */}
      <div
        data-testid="chart-header"
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-3 py-2 bg-pink-50/50 border-l-4 border-pink-400 cursor-pointer hover:bg-pink-50 transition-colors duration-150"
      >
        <button
          data-testid="chart-toggle"
          onClick={handleToggle}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <PiCaretDown size={14} /> : <PiCaretRight size={14} />}
        </button>

        <span className="text-sm text-pink-600 flex-shrink-0">{'Chart: '}</span>

        <span className="flex-1 flex flex-col">
          <input
            data-testid="chart-name-input"
            value={renameValue}
            disabled={isLoadedChart}
            onFocus={() => setIsEditing(true)}
            onChange={(e) => {
              setRenameValue(e.target.value);
              if (renameError) setRenameError(null);
            }}
            onBlur={() => commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') {
                skipNextCommitRef.current = true;
                setRenameError(null);
                setRenameValue(chartName || 'Untitled');
                setIsEditing(false);
                e.target.blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className={`text-sm font-medium text-pink-800 bg-transparent border-0 border-b border-transparent px-0 py-0 outline-none focus:border-pink-400 disabled:cursor-default ${
              renameError ? 'border-red-400 focus:border-red-400' : ''
            }`}
          />
          {renameError && (
            <span
              data-testid="chart-rename-error"
              className="text-xs text-red-600 mt-0.5"
            >
              {renameError}
            </span>
          )}
        </span>

        <button
          data-testid="chart-close"
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
          title="Close chart"
        >
          <PiX size={14} />
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-pink-400">
          {/* Insight List (drop zone for existing insights from left nav) */}
          <div
            ref={setInsightDropRef}
            data-testid="chart-insight-drop-zone"
            className={`rounded p-2 transition-all ${
              isInsightOver ? 'ring-2 ring-pink-400 ring-offset-1 bg-pink-50/50' : ''
            }`}
          >
            <label className="block text-xs font-medium text-gray-600 mb-1">Insights</label>
            {chartInsightNames.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                No insights added yet. Drag from left nav or click below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {chartInsightNames.map((name) => (
                  <InsightPillItem
                    key={name}
                    name={name}
                    isActive={name === activeInsightName}
                    onClick={() => handleInsightClick(name)}
                    onRemove={(e) => handleRemoveInsight(e, name)}
                  />
                ))}
              </div>
            )}
            <button
              data-testid="chart-add-insight"
              onClick={handleAddInsight}
              className="flex items-center gap-1 mt-2 text-xs text-pink-600 hover:text-pink-800 transition-colors"
            >
              <PiPlus size={12} />
              Add Insight
            </button>
          </div>

          {/* Layout Properties */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Layout Properties</label>
              {layoutSchema && (
                <PropertyFilter
                  totalCount={totalLayoutPropertyCount}
                  essentialCount={essentialLayoutPropertyCount}
                  mode={layoutFilterMode}
                  onChange={handleLayoutFilterModeChange}
                />
              )}
            </div>
            <SchemaEditor
              schema={layoutSchema}
              value={chartLayout}
              onChange={handleLayoutChange}
              excludeProperties={[]}
              initiallyExpanded={Object.keys(chartLayout || {})}
              droppable={false}
              filterToKeys={
                layoutFilterMode === 'essentials' ? availableLayoutEssentialPaths : null
              }
              hidePropertyCount={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartCRUDSection;
