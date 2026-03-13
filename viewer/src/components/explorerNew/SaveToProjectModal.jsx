import { useState, useCallback, useEffect, useRef } from 'react';
import {
  PiX,
  PiCube,
  PiChartBar,
  PiFunction,
  PiChartLine,
  PiSquaresFour,
} from 'react-icons/pi';
import useStore from '../../stores/store';

const STATUS_BADGE = ({ label = 'New' }) => (
  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">
    {label}
  </span>
);

const SECTION_STYLES = {
  model: {
    icon: PiCube,
    border: 'border-l-amber-400',
    bg: 'bg-amber-50/50',
    iconColor: 'text-amber-600',
  },
  metric: {
    icon: PiChartBar,
    border: 'border-l-cyan-400',
    bg: 'bg-cyan-50/50',
    iconColor: 'text-cyan-600',
  },
  dimension: {
    icon: PiFunction,
    border: 'border-l-teal-400',
    bg: 'bg-teal-50/50',
    iconColor: 'text-teal-600',
  },
  insight: {
    icon: PiChartLine,
    border: 'border-l-purple-400',
    bg: 'bg-purple-50/50',
    iconColor: 'text-purple-600',
  },
  chart: {
    icon: PiSquaresFour,
    border: 'border-l-indigo-400',
    bg: 'bg-indigo-50/50',
    iconColor: 'text-indigo-600',
  },
};

const SaveToProjectModal = () => {
  const isOpen = useStore((s) => s.explorerSaveModalOpen);
  const setOpen = useStore((s) => s.setExplorerSaveModalOpen);
  const saveToProject = useStore((s) => s.saveExplorerToProject);
  const explorerSql = useStore((s) => s.explorerSql);
  const explorerSourceName = useStore((s) => s.explorerSourceName);
  const insightType = useStore((s) => s.explorerInsightConfig?.props?.type || 'scatter');
  const computedColumns = useStore((s) => s.explorerComputedColumns);
  const activeModelName = useStore((s) => s.explorerActiveModelName);

  const [modelName, setModelName] = useState('');
  const [insightName, setInsightName] = useState('');
  const [chartName, setChartName] = useState('');
  const [computedNames, setComputedNames] = useState({});
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      // Use active model name if editing an existing model, otherwise extract from SQL
      let baseName = activeModelName || '';
      if (!baseName && explorerSql) {
        const match = explorerSql.match(/\bFROM\s+["'`]?(\w+)["'`]?/i);
        baseName = match ? match[1] : '';
      }
      if (baseName) {
        // If already a model name (from editing), use it directly
        setModelName(activeModelName || `${baseName}_model`);
        setInsightName(`${baseName}_${insightType}`);
        setChartName(`${baseName}_chart`);
      }
      const names = {};
      (computedColumns || []).forEach((col) => {
        names[col.name] = col.name;
      });
      setComputedNames(names);
      setError(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, explorerSql, insightType, computedColumns, activeModelName]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError(null);
  }, [setOpen]);

  const handleSave = useCallback(async () => {
    if (!modelName || !insightName || !chartName) return;

    setIsSaving(true);
    setError(null);

    const result = await saveToProject({
      modelName,
      insightName,
      chartName,
      computedNames,
    });

    setIsSaving(false);

    if (result.success) {
      setModelName('');
      setInsightName('');
      setChartName('');
      setComputedNames({});
    } else {
      setError(result.error);
    }
  }, [modelName, insightName, chartName, computedNames, saveToProject]);

  const canSave = modelName && insightName && chartName && !isSaving;

  const metrics = (computedColumns || []).filter((c) => c.type === 'metric');
  const dimensions = (computedColumns || []).filter((c) => c.type === 'dimension');

  if (!isOpen) return null;

  const renderSection = (type, label, children) => {
    const style = SECTION_STYLES[type];
    const Icon = style.icon;
    return (
      <div
        className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg p-3`}
        data-testid={`save-section-${type}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} className={style.iconColor} />
          <span className="text-sm font-medium text-secondary-800">{label}</span>
          <STATUS_BADGE />
        </div>
        {children}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      data-testid="save-modal-overlay"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[520px] max-w-[90vw] max-h-[80vh] flex flex-col"
        data-testid="save-modal"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-secondary-800">Save to Project</h2>
          <button
            onClick={handleClose}
            className="text-secondary-400 hover:text-secondary-600 transition-colors"
            data-testid="save-modal-close"
          >
            <PiX size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs text-secondary-500 mb-2">
            Objects will be saved to the project cache.
          </p>

          {/* Model Section */}
          {renderSection('model', 'Model', (
            <div className="space-y-1.5">
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full text-sm border border-secondary-300 rounded px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Model name"
                data-testid="save-modal-model-name"
              />
              {explorerSourceName && (
                <span className="text-xs text-secondary-500">Source: {explorerSourceName}</span>
              )}
            </div>
          ))}

          {/* Metrics Section */}
          {metrics.length > 0 &&
            renderSection('metric', `Metrics (${metrics.length})`, (
              <div className="space-y-1.5">
                {metrics.map((col) => (
                  <div key={col.name} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={computedNames[col.name] || col.name}
                      onChange={(e) =>
                        setComputedNames((prev) => ({ ...prev, [col.name]: e.target.value }))
                      }
                      className="flex-1 text-sm border border-secondary-300 rounded px-2.5 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      data-testid={`save-modal-metric-${col.name}`}
                    />
                    <span className="text-[10px] text-secondary-400 font-mono truncate max-w-[120px]" title={col.expression}>
                      {col.expression}
                    </span>
                  </div>
                ))}
              </div>
            ))}

          {/* Dimensions Section */}
          {dimensions.length > 0 &&
            renderSection('dimension', `Dimensions (${dimensions.length})`, (
              <div className="space-y-1.5">
                {dimensions.map((col) => (
                  <div key={col.name} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={computedNames[col.name] || col.name}
                      onChange={(e) =>
                        setComputedNames((prev) => ({ ...prev, [col.name]: e.target.value }))
                      }
                      className="flex-1 text-sm border border-secondary-300 rounded px-2.5 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      data-testid={`save-modal-dimension-${col.name}`}
                    />
                    <span className="text-[10px] text-secondary-400 font-mono truncate max-w-[120px]" title={col.expression}>
                      {col.expression}
                    </span>
                  </div>
                ))}
              </div>
            ))}

          {/* Insight Section */}
          {renderSection('insight', 'Insight', (
            <div className="space-y-1.5">
              <input
                type="text"
                value={insightName}
                onChange={(e) => setInsightName(e.target.value)}
                className="w-full text-sm border border-secondary-300 rounded px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Insight name"
                data-testid="save-modal-insight-name"
              />
              <span className="text-xs text-secondary-500">Type: {insightType}</span>
            </div>
          ))}

          {/* Chart Section */}
          {renderSection('chart', 'Chart', (
            <input
              type="text"
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
              className="w-full text-sm border border-secondary-300 rounded px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Chart name"
              data-testid="save-modal-chart-name"
            />
          ))}

          {error && (
            <div
              className="text-sm text-highlight bg-highlight-50 px-3 py-2 rounded-lg"
              data-testid="save-modal-error"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-secondary-200 flex gap-3 justify-end flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
            data-testid="save-modal-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="save-modal-confirm"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveToProjectModal;
