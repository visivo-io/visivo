import React, { useState, useMemo, useCallback } from 'react';
import useStore from '../../stores/store';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';

/**
 * Determines the status of a model state entry.
 * Returns 'new', 'modified', or null (unchanged).
 */
const getModelStatus = (ms) => {
  if (!ms) return null;
  if (ms.isNew) return 'new';
  if (ms.sql !== ms._originalSql) return 'modified';
  if (ms.sourceName !== ms._originalSourceName) return 'modified';
  if (JSON.stringify(ms.computedColumns) !== JSON.stringify(ms._originalComputedColumns))
    return 'modified';
  return null;
};

/**
 * Determines the status of an insight state entry.
 * Returns 'new', 'modified', or null (unchanged).
 */
const getInsightStatus = (is) => {
  if (!is) return null;
  if (is.isNew) return 'new';
  if (is.type !== is._originalType) return 'modified';
  if (JSON.stringify(is.props) !== JSON.stringify(is._originalProps)) return 'modified';
  return null;
};

/**
 * ExplorerSaveModal - Shows a summary of objects to be saved and handles the save operation.
 *
 * Props:
 * - onClose: (function) called when the modal should close (cancel or successful save)
 */
const ExplorerSaveModal = ({ onClose }) => {
  const modelStates = useStore((s) => s.explorerModelStates);
  const insightStates = useStore((s) => s.explorerInsightStates);
  const chartName = useStore((s) => s.explorerChartName);
  const saveExplorerObjects = useStore((s) => s.saveExplorerObjects);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const {
    newModels,
    modifiedModels,
    newInsights,
    modifiedInsights,
    newMetrics,
    newDimensions,
    hasChart,
  } = useMemo(() => {
    const newM = [];
    const modM = [];
    const newMet = [];
    const newDim = [];
    for (const [name, ms] of Object.entries(modelStates)) {
      const status = getModelStatus(ms);
      if (status === 'new') newM.push(name);
      else if (status === 'modified') modM.push(name);

      // Extract computed columns as metrics/dimensions
      for (const cc of ms.computedColumns || []) {
        if (cc.type === 'metric') newMet.push(cc.name);
        else newDim.push(cc.name);
      }
    }

    const newI = [];
    const modI = [];
    for (const [name, is] of Object.entries(insightStates)) {
      const status = getInsightStatus(is);
      if (status === 'new') newI.push(name);
      else if (status === 'modified') modI.push(name);
    }

    return {
      newModels: newM,
      modifiedModels: modM,
      newInsights: newI,
      modifiedInsights: modI,
      newMetrics: newMet,
      newDimensions: newDim,
      hasChart: !!chartName,
    };
  }, [modelStates, insightStates, chartName]);

  const totalChanges =
    newModels.length +
    modifiedModels.length +
    newInsights.length +
    modifiedInsights.length +
    newMetrics.length +
    newDimensions.length;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveExplorerObjects();
      if (result.success) {
        onClose();
      } else {
        const messages = result.errors.map((e) => `${e.type} "${e.name}": ${e.error}`);
        setError(messages.join('; '));
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }, [saveExplorerObjects, onClose]);

  return (
    <div
      data-testid="explorer-save-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-medium text-secondary-900 mb-4">Save to Project</h3>

        {totalChanges === 0 && !hasChart && (
          <p className="text-sm text-secondary-500 mb-4">No changes to save.</p>
        )}

        {/* New objects */}
        {(newModels.length > 0 ||
          newInsights.length > 0 ||
          newMetrics.length > 0 ||
          newDimensions.length > 0) && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              New
            </p>
            <div className="flex flex-wrap gap-1.5">
              {newModels.map((name) => (
                <EmbeddedPill
                  key={`model-${name}`}
                  objectType="model"
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
              {newInsights.map((name) => (
                <EmbeddedPill
                  key={`insight-${name}`}
                  objectType="insight"
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
              {newMetrics.map((name) => (
                <EmbeddedPill
                  key={`metric-${name}`}
                  objectType="metric"
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
              {newDimensions.map((name) => (
                <EmbeddedPill
                  key={`dimension-${name}`}
                  objectType="dimension"
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
            </div>
          </div>
        )}

        {/* Modified objects */}
        {(modifiedModels.length > 0 || modifiedInsights.length > 0) && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              Modified
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modifiedModels.map((name) => (
                <EmbeddedPill
                  key={`model-${name}`}
                  objectType="model"
                  label={name}
                  statusDot="modified"
                  as="div"
                />
              ))}
              {modifiedInsights.map((name) => (
                <EmbeddedPill
                  key={`insight-${name}`}
                  objectType="insight"
                  label={name}
                  statusDot="modified"
                  as="div"
                />
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        {hasChart && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              Chart
            </p>
            <div className="flex flex-wrap gap-1.5">
              <EmbeddedPill objectType="chart" label={chartName} as="div" />
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div
            data-testid="save-error"
            className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            data-testid="save-modal-cancel"
            type="button"
            disabled={saving}
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium rounded-lg border border-secondary-300 text-secondary-700 hover:bg-secondary-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            data-testid="save-modal-confirm"
            type="button"
            disabled={saving || totalChanges === 0}
            onClick={handleSave}
            className="py-2 px-4 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExplorerSaveModal;
