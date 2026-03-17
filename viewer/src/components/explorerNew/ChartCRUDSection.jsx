import React, { useState, useEffect, useCallback } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPlus } from 'react-icons/pi';
import useStore from '../../stores/store';
import { getSchema } from '../../schemas/schemas';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';

const ChartCRUDSection = ({ isExpanded, onToggleExpand }) => {
  const chartName = useStore((s) => s.explorerChartName);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const insightStates = useStore((s) => s.explorerInsightStates);
  const setChartName = useStore((s) => s.setChartName);
  const replaceChartLayout = useStore((s) => s.replaceChartLayout);
  const createInsight = useStore((s) => s.createInsight);
  const removeInsightFromChart = useStore((s) => s.removeInsightFromChart);
  const setActiveInsight = useStore((s) => s.setActiveInsight);

  const [layoutSchema, setLayoutSchema] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then((s) => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNameChange = useCallback(
    (e) => {
      setChartName(e.target.value);
    },
    [setChartName]
  );

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

  return (
    <div
      data-testid="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
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

        <span className="text-sm font-medium text-pink-800 truncate flex-1">
          Chart: {chartName || 'Untitled'}
        </span>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-4 border-l-4 border-pink-400">
          {/* Chart Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              data-testid="chart-name-input"
              type="text"
              value={chartName || ''}
              onChange={handleNameChange}
              placeholder="Chart name..."
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-2 focus:ring-pink-200 focus:border-pink-400 transition-colors"
            />
          </div>

          {/* Insight List */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Insights</label>
            {chartInsightNames.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No insights added yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {chartInsightNames.map((name) => {
                  const isActive = name === activeInsightName;
                  const insight = insightStates[name];
                  return (
                    <button
                      key={name}
                      data-testid={`chart-insight-pill-${name}`}
                      onClick={() => handleInsightClick(name)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all
                        bg-purple-100 text-purple-800 border-purple-200
                        hover:shadow-sm cursor-pointer
                        ${isActive ? 'ring-2 ring-purple-400' : ''}
                      `}
                    >
                      <span className="truncate max-w-[120px]">{name}</span>
                      {insight?.isNew && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      )}
                      <span
                        data-testid={`chart-remove-insight-${name}`}
                        onClick={(e) => handleRemoveInsight(e, name)}
                        className="text-purple-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        <PiX size={10} />
                      </span>
                    </button>
                  );
                })}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Layout Properties
            </label>
            <SchemaEditor
              schema={layoutSchema}
              value={chartLayout}
              onChange={handleLayoutChange}
              excludeProperties={[]}
              initiallyExpanded={[]}
              droppable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartCRUDSection;
