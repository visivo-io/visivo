import React, { useEffect, useMemo, useRef } from 'react';
import useStore from '../../../stores/store';
import Table from '../../items/Table';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useModelsData } from '../../../hooks/useModelsData';
import { classifyTableDataNames } from '../../../utils/tableDataNames';
import { usePreviewInputDependencies } from './usePreviewInputDependencies';
import PreviewInputControls from './PreviewInputControls';

/**
 * TablePreview — VIS-791 / N-2.
 *
 * Renders the active table full-size via the EXISTING `<Table>` renderer (the
 * same component the Dashboard mounts; tables provide their own internal scroll
 * / pagination). No editing affordances — editing lives in the right rail.
 *
 * A table's `data` is a `${ref()}` to EITHER a model OR an insight (and its
 * pivot `columns`/`rows`/`values` carry further refs). `classifyTableDataNames`
 * sorts them exactly as <Dashboard> does, so a saved table previews identically
 * to how it renders on a dashboard.
 */
const TablePreview = ({ activeObject, projectId }) => {
  const name = activeObject?.name || null;
  const tables = useStore(s => s.tables);
  const fetchTables = useStore(s => s.fetchTables);
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);
  const modelsLoaded = useStore(s => s.modelsLoaded);
  const insights = useStore(s => s.insights);
  const fetchInsights = useStore(s => s.fetchInsights);
  const insightsLoaded = useStore(s => s.insightsLoaded);

  // One request per collection per mount. An empty list is a normal loaded
  // state, so "empty" must never re-trigger the fetch.
  const requested = useRef({ tables: false, models: false, insights: false });
  useEffect(() => {
    const once = (key, needed, fetch) => {
      if (requested.current[key] || !needed || typeof fetch !== 'function') return;
      requested.current[key] = true;
      fetch();
    };
    once('tables', !tables || tables.length === 0, fetchTables);
    once('models', !modelsLoaded, fetchModels);
    once('insights', !insightsLoaded, fetchInsights);
  }, [tables, fetchTables, modelsLoaded, fetchModels, insightsLoaded, fetchInsights]);

  const record = useMemo(
    () => (Array.isArray(tables) ? tables.find(t => t.name === name) || null : null),
    [tables, name]
  );

  const tableConfig = useMemo(() => {
    if (!record) return null;
    const config = record.config || record;
    return { name: record.name, ...config };
  }, [record]);

  const knownModelNames = useMemo(
    () => new Set((Array.isArray(models) ? models : []).map(m => m.name)),
    [models]
  );

  const knownInsightNames = useMemo(
    () => new Set((Array.isArray(insights) ? insights : []).map(i => i.name)),
    [insights]
  );

  const { modelNames, insightNames } = useMemo(
    () =>
      classifyTableDataNames(tableConfig, {
        isKnownModel: n => knownModelNames.has(n),
        isKnownInsight: n => knownInsightNames.has(n),
        registriesLoading: !(modelsLoaded && insightsLoaded),
      }),
    [tableConfig, knownModelNames, knownInsightNames, modelsLoaded, insightsLoaded]
  );

  useModelsData(projectId, modelNames);
  useInsightsData(projectId, insightNames);

  // Resolve the UNION of input widgets across the table's insight-backed parents
  // (the insightNames it already classifies), with a config fallback across the
  // table config (props/layout/interactions), and seed defaults so the table
  // populates immediately (VIS-1003). Replaces the hardcoded empty input list.
  const { inputConfigs } = usePreviewInputDependencies(projectId, {
    insightNames,
    configForFallback: tableConfig,
  });

  if (!tableConfig) {
    return (
      <div
        data-testid="table-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Table "${name}" not found.` : 'No table selected.'}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="table-preview" className="flex flex-1 min-h-0 min-w-0 flex-col bg-white">
      <PreviewInputControls inputConfigs={inputConfigs} projectId={projectId} />
      {/* min-w-0 lets this flex child shrink below the table's intrinsic width so
          the inner overflow-auto scrolls a wide table instead of overflowing the
          canvas; w-full max-w-full keeps the body within the pane. */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto p-4">
        <div className="w-full max-w-full min-w-0">
          <Table table={tableConfig} projectId={projectId} shouldLoad={true} height={600} />
        </div>
      </div>
    </div>
  );
};

export default TablePreview;
