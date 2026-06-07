import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import useStore from '../../../stores/store';
import { useModelQueryJob } from '../../../hooks/useModelQueryJob';
import { parseRefValue } from '../../../utils/refString';

/**
 * ModelPreview — VIS-801 / N-6.
 *
 * Renders the active model as a READ-ONLY SQL editor (the same Monaco editor
 * ModelEditForm uses, in read-only mode) plus a result-table preview. The
 * result table renders only AFTER the user clicks Run — running executes the
 * model's SQL against its source via the EXISTING `useModelQueryJob` hook (the
 * same /api/model-query-jobs path the Explorer SQL editor uses). No editing
 * affordances — editing lives in the right rail.
 *
 * The model record is resolved from the model store by name (RightRailEditPanel
 * COLLECTION_KEY['model'] = 'models'). The source name is read from the model's
 * `source` ref (falling back to the first available source / project default).
 */
const ModelPreview = ({ activeObject }) => {
  const name = activeObject?.name || null;
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);
  const sources = useStore(s => s.sources);
  const fetchSources = useStore(s => s.fetchSources);

  const { status, progress, progressMessage, result, error, isRunning, executeQuery } =
    useModelQueryJob();

  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') {
      fetchModels();
    }
    if ((!sources || sources.length === 0) && typeof fetchSources === 'function') {
      fetchSources();
    }
  }, [models, fetchModels, sources, fetchSources]);

  const record = useMemo(
    () => (Array.isArray(models) ? models.find(m => m.name === name) || null : null),
    [models, name]
  );

  const config = useMemo(() => (record ? record.config || record : null), [record]);
  const sql = config?.sql || '';

  const sourceName = useMemo(() => {
    if (config?.source && typeof config.source === 'string') {
      return parseRefValue(config.source);
    }
    // Fall back to the first available named source so Run still works for
    // models that rely on the project's default source.
    const list = Array.isArray(sources) ? sources : [];
    return list[0]?.name || null;
  }, [config, sources]);

  const [hasRun, setHasRun] = useState(false);

  const handleRun = () => {
    if (!sourceName || !sql) return;
    setHasRun(true);
    executeQuery(sourceName, sql).catch(() => {});
  };

  const rows = useMemo(() => result?.rows || result?.data || [], [result]);
  const columns = useMemo(() => {
    if (result?.columns) return result.columns;
    if (Array.isArray(rows) && rows.length > 0) return Object.keys(rows[0]);
    return [];
  }, [result, rows]);

  if (!config) {
    return (
      <div
        data-testid="model-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Model "${name}" not found.` : 'No model selected.'}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="model-preview" className="flex flex-1 min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-[12px] text-gray-500">
          {sourceName ? (
            <>
              Source: <span className="font-mono text-gray-700">{sourceName}</span>
            </>
          ) : (
            'No source resolved'
          )}
        </span>
        <button
          type="button"
          data-testid="model-preview-run"
          onClick={handleRun}
          disabled={isRunning || !sourceName || !sql}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[#713b57] px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5a2f45] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? (
            <CircularProgress size={12} style={{ color: 'white' }} />
          ) : (
            <PlayArrowIcon style={{ fontSize: 16 }} />
          )}
          Run
        </button>
      </div>

      <div className="border-b border-gray-200" style={{ height: 240 }}>
        <Editor
          height="240px"
          language="sql"
          theme="vs-dark"
          value={sql}
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            automaticLayout: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            folding: false,
          }}
        />
      </div>

      <div data-testid="model-preview-results" className="flex-1 min-h-0 overflow-auto p-3">
        {!hasRun ? (
          <div className="flex h-full items-center justify-center text-center">
            <span className="text-sm text-gray-500">Run the query to preview results.</span>
          </div>
        ) : isRunning ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircularProgress size={32} />
            <span className="text-sm text-gray-600">{progressMessage || 'Running query…'}</span>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-[#713b57] transition-all duration-300"
                style={{ width: `${(progress || 0) * 100}%` }}
              />
            </div>
          </div>
        ) : error ? (
          <div
            data-testid="model-preview-error"
            className="rounded bg-red-50 p-3 font-mono text-sm text-red-700"
          >
            {typeof error === 'string' ? error : error?.message || String(error)}
          </div>
        ) : status === 'completed' && columns.length > 0 ? (
          <table className="min-w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map(col => (
                  <th key={col} className="px-3 py-1.5 font-semibold text-gray-700">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100">
                  {columns.map(col => (
                    <td key={col} className="px-3 py-1 font-mono text-gray-800">
                      {row[col] === null || row[col] === undefined ? '' : String(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <span className="text-sm text-gray-500">Query returned no rows.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelPreview;
