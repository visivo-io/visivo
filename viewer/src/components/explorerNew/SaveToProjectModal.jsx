import { useState, useCallback, useEffect, useRef } from 'react';
import { PiX } from 'react-icons/pi';
import useStore from '../../stores/store';

const SaveToProjectModal = () => {
  const isOpen = useStore((s) => s.explorerSaveModalOpen);
  const setOpen = useStore((s) => s.setExplorerSaveModalOpen);
  const saveToProject = useStore((s) => s.saveExplorerToProject);
  const projectFileObjects = useStore((s) => s.projectFileObjects);
  const projectFilePath = useStore((s) => s.projectFilePath);
  const explorerSql = useStore((s) => s.explorerSql);
  const insightType = useStore((s) => s.explorerInsightConfig?.props?.type || 'scatter');

  const [modelName, setModelName] = useState('');
  const [insightName, setInsightName] = useState('');
  const [chartName, setChartName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      // Modal just opened — auto-suggest names
      if (explorerSql) {
        const match = explorerSql.match(/\bFROM\s+["'`]?(\w+)["'`]?/i);
        const table = match ? match[1] : '';
        if (table) {
          setModelName(`${table}_model`);
          setInsightName(`${table}_${insightType}`);
          setChartName(`${table}_chart`);
        }
      }
      setError(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, explorerSql, insightType]);

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
      filePath: filePath || projectFilePath,
    });

    setIsSaving(false);

    if (result.success) {
      setModelName('');
      setInsightName('');
      setChartName('');
      setFilePath('');
    } else {
      setError(result.error);
    }
  }, [modelName, insightName, chartName, filePath, projectFilePath, saveToProject]);

  const canSave = modelName && insightName && chartName && !isSaving;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" data-testid="save-modal-overlay">
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-[90vw]" data-testid="save-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Save to Project</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            data-testid="save-modal-close"
          >
            <PiX size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. orders_model"
              data-testid="save-modal-model-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Insight Name</label>
            <input
              type="text"
              value={insightName}
              onChange={(e) => setInsightName(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. orders_scatter"
              data-testid="save-modal-insight-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chart Name</label>
            <input
              type="text"
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. orders_chart"
              data-testid="save-modal-chart-name"
            />
          </div>

          {projectFileObjects?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
              <select
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                data-testid="save-modal-file-path"
              >
                <option value="">Default project file</option>
                {projectFileObjects.map((f) => (
                  <option key={f.full_path} value={f.full_path}>
                    {f.relative_path}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div
              className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"
              data-testid="save-modal-error"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
