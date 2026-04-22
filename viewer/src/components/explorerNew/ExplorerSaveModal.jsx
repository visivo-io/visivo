import React, { useState, useMemo, useCallback } from 'react';
import useStore from '../../stores/store';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';

/**
 * ExplorerSaveModal - Shows a summary of objects to be saved and handles the save operation.
 *
 * Reads modification status from explorerDiffResult (populated by backend /api/explorer/diff/).
 *
 * Props:
 * - onClose: (function) called when the modal should close (cancel or successful save)
 */
const ExplorerSaveModal = ({ onClose }) => {
  const diffResult = useStore((s) => s.explorerDiffResult);
  const chartName = useStore((s) => s.explorerChartName);
  const saveExplorerObjects = useStore((s) => s.saveExplorerObjects);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { newItems, modifiedItems, chartStatus } = useMemo(() => {
    const newArr = [];
    const modArr = [];

    if (diffResult) {
      for (const [category, statuses] of Object.entries(diffResult)) {
        if (category === 'chart') continue;
        // Map category to objectType (e.g., "models" → "model")
        const objectType = category.replace(/s$/, '');
        for (const [name, status] of Object.entries(statuses || {})) {
          if (status === 'new') newArr.push({ name, objectType });
          else if (status === 'modified') modArr.push({ name, objectType });
        }
      }
    }

    return {
      newItems: newArr,
      modifiedItems: modArr,
      chartStatus: diffResult?.chart || null,
    };
  }, [diffResult]);

  const totalChanges = newItems.length + modifiedItems.length + (chartStatus ? 1 : 0);

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

        {totalChanges === 0 && (
          <p className="text-sm text-secondary-500 mb-4">No changes to save.</p>
        )}

        {/* New objects */}
        {(newItems.length > 0 || chartStatus === 'new') && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              New
            </p>
            <div className="flex flex-wrap gap-1.5">
              {newItems.map(({ name, objectType }) => (
                <EmbeddedPill
                  key={`${objectType}-${name}`}
                  objectType={objectType}
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
              {chartStatus === 'new' && (
                <EmbeddedPill objectType="chart" label={chartName} statusDot="new" as="div" />
              )}
            </div>
          </div>
        )}

        {/* Modified objects */}
        {(modifiedItems.length > 0 || chartStatus === 'modified') && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              Modified
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modifiedItems.map(({ name, objectType }) => (
                <EmbeddedPill
                  key={`${objectType}-${name}`}
                  objectType={objectType}
                  label={name}
                  statusDot="modified"
                  as="div"
                />
              ))}
              {chartStatus === 'modified' && (
                <EmbeddedPill objectType="chart" label={chartName} statusDot="modified" as="div" />
              )}
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
