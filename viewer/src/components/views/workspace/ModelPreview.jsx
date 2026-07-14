import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import useStore from '../../../stores/store';
import { useModelQueryJob } from '../../../hooks/useModelQueryJob';
import { parseRefValue } from '../../../utils/refString';
import FieldPill from '../common/FieldPill';

/**
 * SemanticFieldsStrip — the model's dimension + metric pills (VIS-1009 secondary).
 *
 * A compact strip of the model's semantic-layer fields, rendered with the shared
 * `FieldPill` (colored + iconed via objectTypeConfigs — dimension=teal,
 * metric=cyan). Renders nothing when the model owns no fields, so it never adds
 * chrome to a plain SQL model.
 */

const SemanticFieldsStrip = ({ modelName }) => {
  const dimensions = useStore(s => s.dimensions);
  const metrics = useStore(s => s.metrics);
  const fetchDimensions = useStore(s => s.fetchDimensions);
  const fetchMetrics = useStore(s => s.fetchMetrics);

  // Fetch AT MOST ONCE per mount (ref-guarded, NOT length-guarded): every
  // fetch action writes a FRESH array even when the backend returns nothing,
  // so an empty-collection guard keyed on array identity refires forever
  // (fetch → new [] → effect → fetch …).
  const didFetchRef = useRef(false);
  useEffect(() => {
    if (didFetchRef.current) return;
    didFetchRef.current = true;
    if ((!dimensions || dimensions.length === 0) && typeof fetchDimensions === 'function') {
      fetchDimensions();
    }
    if ((!metrics || metrics.length === 0) && typeof fetchMetrics === 'function') fetchMetrics();
  }, [dimensions, fetchDimensions, metrics, fetchMetrics]);

  const ownedDimensions = useMemo(
    () =>
      Array.isArray(dimensions)
        ? dimensions.filter(d => (d.parentModel || d.config?.model) === modelName)
        : [],
    [dimensions, modelName]
  );
  const ownedMetrics = useMemo(
    () =>
      Array.isArray(metrics)
        ? metrics.filter(m => (m.parentModel || m.config?.model) === modelName)
        : [],
    [metrics, modelName]
  );

  if (ownedDimensions.length === 0 && ownedMetrics.length === 0) return null;

  return (
    <div
      data-testid="model-semantic-fields"
      className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 px-4 py-2"
    >
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Fields
      </span>
      {ownedDimensions.map(d => (
        <FieldPill
          key={`dim-${d.name}`}
          type="dimension"
          name={d.name}
          data-testid={`model-field-pill-dimension-${d.name}`}
        />
      ))}
      {ownedMetrics.map(m => (
        <FieldPill
          key={`met-${m.name}`}
          type="metric"
          name={m.name}
          data-testid={`model-field-pill-metric-${m.name}`}
        />
      ))}
    </div>
  );
};

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
const ModelPreview = ({ activeObject, record: providedRecord }) => {
  const name = activeObject?.name || null;
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);
  // The Library surfaces the whole model family as type 'model', so the Model
  // canvas must resolve a record across all three collections — a SqlModel, a
  // csvScriptModel, or a localMergeModel — or it would dead-end on "not found"
  // for the latter two (whose records never live in `models`).
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const fetchCsvScriptModels = useStore(s => s.fetchCsvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);
  const fetchLocalMergeModels = useStore(s => s.fetchLocalMergeModels);
  const sources = useStore(s => s.sources);
  const fetchSources = useStore(s => s.fetchSources);
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);

  const { status, progress, progressMessage, result, error, isRunning, executeQuery } =
    useModelQueryJob();

  // Same ref-guarded fetch-once as SemanticFieldsStrip: the effect is keyed on
  // collection identity, and an empty backend response still produces a fresh
  // [] — gating on length alone loops forever.
  const didFetchRef = useRef(false);
  useEffect(() => {
    if (didFetchRef.current) return;
    didFetchRef.current = true;
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if ((!csvScriptModels || csvScriptModels.length === 0) && typeof fetchCsvScriptModels === 'function')
      fetchCsvScriptModels();
    if ((!localMergeModels || localMergeModels.length === 0) && typeof fetchLocalMergeModels === 'function')
      fetchLocalMergeModels();
    if ((!sources || sources.length === 0) && typeof fetchSources === 'function') fetchSources();
    if (!defaults && typeof fetchDefaults === 'function') fetchDefaults();
  }, [
    models,
    fetchModels,
    csvScriptModels,
    fetchCsvScriptModels,
    localMergeModels,
    fetchLocalMergeModels,
    sources,
    fetchSources,
    defaults,
    fetchDefaults,
  ]);

  const record = useMemo(() => {
    const find = arr => (Array.isArray(arr) ? arr.find(m => m.name === name) || null : null);
    return find(models) || find(csvScriptModels) || find(localMergeModels) || null;
  }, [models, csvScriptModels, localMergeModels, name]);

  // The frame resolves the record (via useCanvasRecord) and passes the unwrapped
  // config as `record` — use it so csvScriptModel / localMergeModel (whose
  // records live in their own collections, not `models`) also render the Model
  // canvas. Falls back to the local `models` lookup when mounted standalone.
  const config = useMemo(
    () => providedRecord || (record ? record.config || record : null),
    [providedRecord, record]
  );
  const sql = config?.sql || '';

  const sourceName = useMemo(() => {
    if (config?.source && typeof config.source === 'string') {
      return parseRefValue(config.source);
    }
    // A source-less model uses the PROJECT DEFAULT source (defaults.source_name),
    // exactly as the run/compile path resolves it — NOT just the first source in
    // the list (which may be an unusable / uninstalled dialect). Mirrors the
    // explorerStore `defaults.source_name || firstAvailableSource` convention.
    const list = Array.isArray(sources) ? sources : [];
    return defaults?.source_name || list[0]?.name || null;
  }, [config, sources, defaults]);

  const [hasRun, setHasRun] = useState(false);

  // The SQL editor is Monaco (a dark, canvas-rendered widget). The "black panes"
  // on a rail-divider drag came from this pane not being allowed to SHRINK: the
  // root + editor container lacked `min-w-0`, so the flex item kept its content
  // width and the dark editor overflowed the narrowing pane. `min-w-0` (below)
  // lets it shrink; this forces an immediate Monaco relayout as the width
  // changes so it repaints in step instead of lagging behind `automaticLayout`.
  const editorRef = useRef(null);
  const rightWidth = useStore(s => s.workspaceRightWidth);
  const leftWidth = useStore(s => s.workspaceLeftWidth);
  const resizing = useStore(s => s.workspaceResizing);
  useEffect(() => {
    editorRef.current?.layout?.();
  }, [rightWidth, leftWidth, resizing]);

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
    <div data-testid="model-preview" className="flex flex-1 min-h-0 min-w-0 flex-col bg-white">
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
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? (
            <CircularProgress size={12} style={{ color: 'white' }} />
          ) : (
            <PlayArrowIcon style={{ fontSize: 16 }} />
          )}
          Run
        </button>
      </div>

      <SemanticFieldsStrip modelName={config.name || name} />

      <div className="min-w-0 overflow-hidden border-b border-gray-200" style={{ height: 240 }}>
        <Editor
          height="240px"
          language="sql"
          theme="vs-dark"
          value={sql}
          onMount={editor => {
            editorRef.current = editor;
          }}
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
                className="h-full bg-primary transition-all duration-300"
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
