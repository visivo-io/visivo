import React, { useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import Table from '../../items/Table';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useModelsData } from '../../../hooks/useModelsData';
import {
  parseRefValue,
  extractRefNamesFromStrings,
} from '../../../utils/refString';
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
 * pivot `columns`/`rows`/`values` carry further refs). We classify the data ref
 * against the model registry exactly as <Dashboard> does (the VIS-827 fix) and
 * load it via the same `useModelsData` / `useInsightsData` hooks, so a saved
 * table previews identically to how it renders on a dashboard.
 */
const TablePreview = ({ activeObject, projectId }) => {
  const name = activeObject?.name || null;
  const tables = useStore(s => s.tables);
  const fetchTables = useStore(s => s.fetchTables);
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);

  useEffect(() => {
    if ((!tables || tables.length === 0) && typeof fetchTables === 'function') {
      fetchTables();
    }
    if ((!models || models.length === 0) && typeof fetchModels === 'function') {
      fetchModels();
    }
  }, [tables, fetchTables, models, fetchModels]);

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

  // Classify the data ref + pivot refs into model vs insight buckets, mirroring
  // <Dashboard>'s collectDataNames so the right hook fetches the right data.
  const { modelNames, insightNames } = useMemo(() => {
    const modelSet = new Set();
    const insightSet = new Set();
    if (tableConfig) {
      const { data } = tableConfig;
      if (typeof data === 'string') {
        const dataName = parseRefValue(data);
        if (dataName) (knownModelNames.has(dataName) ? modelSet : insightSet).add(dataName);
      } else if (data && data.name) {
        const isModel = !!(data.sql || data.args || data.models);
        (isModel ? modelSet : insightSet).add(data.name);
      }
      const pivotRefStrings = [
        ...(tableConfig.columns || []),
        ...(tableConfig.rows || []),
        ...(tableConfig.values || []),
      ];
      extractRefNamesFromStrings(pivotRefStrings).forEach(n => {
        (knownModelNames.has(n) ? modelSet : insightSet).add(n);
      });
    }
    return { modelNames: [...modelSet], insightNames: [...insightSet] };
  }, [tableConfig, knownModelNames]);

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
    <div data-testid="table-preview" className="flex flex-1 min-h-0 flex-col bg-white">
      <PreviewInputControls inputConfigs={inputConfigs} projectId={projectId} />
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="w-full">
          <Table table={tableConfig} projectId={projectId} shouldLoad={true} height={600} />
        </div>
      </div>
    </div>
  );
};

export default TablePreview;
