import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useStore from '../../../../stores/store';
import { useInsightsData } from '../../../../hooks/useInsightsData';
import { useModelsData } from '../../../../hooks/useModelsData';
import { parseRefValue, extractRefNamesFromStrings } from '../../../../utils/refString';

/**
 * usePivotPlaygroundFields — VIS-1008.
 *
 * Resolves the candidate fields for the pivot playground's Field List from the
 * table record's underlying data source. A table's pivot config refs either a
 * model OR an insight; we classify the parent the SAME way <Table> / TablePreview
 * does (against the model registry), hydrate it through the same
 * `useModelsData` / `useInsightsData` hooks, then surface the parent's columns
 * as draggable field descriptors.
 *
 * The source-of-truth for a parent's columns is its `props_mapping` (the
 * `props.<field>` → hashed-column map every pivot util already keys on). We
 * reverse it into `{ name, label, source }` field descriptors — `name` is the
 * bare field used to build `${ref(parent).name}` refs, `label` is the
 * humanised header. The single parent `name` is returned as `sourceName` so the
 * playground can serialise refs against it.
 *
 * @param {string} projectId
 * @param {Object} record  the table record's resolved config (may carry a `data`
 *   ref and/or pivot `columns`/`rows`/`values`).
 * @returns {{ fields: Array<{name,label,source}>, sourceName: string|null,
 *   isLoading: boolean }}
 */
export const usePivotPlaygroundFields = (projectId, record) => {
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);

  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') {
      fetchModels();
    }
  }, [models, fetchModels]);

  const knownModelNames = useMemo(
    () => new Set((Array.isArray(models) ? models : []).map(m => m.name)),
    [models]
  );

  // Classify the table's data ref + pivot refs into the (single) parent name and
  // whether it is a model or an insight — mirrors TablePreview's collectDataNames.
  const { sourceName, isModel } = useMemo(() => {
    if (!record) return { sourceName: null, isModel: false };
    const names = new Set();
    const { data } = record;
    if (typeof data === 'string') {
      const dataName = parseRefValue(data);
      if (dataName) names.add(dataName);
    } else if (data && data.name) {
      names.add(data.name);
    }
    extractRefNamesFromStrings([
      ...(record.columns || []),
      ...(record.rows || []),
      ...(record.values || []),
    ]).forEach(n => names.add(n));
    const first = [...names][0] || null;
    return { sourceName: first, isModel: first ? knownModelNames.has(first) : false };
  }, [record, knownModelNames]);

  const insightNames = useMemo(
    () => (sourceName && !isModel ? [sourceName] : []),
    [sourceName, isModel]
  );
  const modelNames = useMemo(
    () => (sourceName && isModel ? [sourceName] : []),
    [sourceName, isModel]
  );

  const { isInsightsLoading } = useInsightsData(projectId, insightNames);
  useModelsData(projectId, modelNames);

  // Read the resolved parent's job entry (props_mapping + load state) from the
  // store, exactly as <Table> does for its sourceData.
  const sourceData = useStore(
    useShallow(state => {
      if (!sourceName) return null;
      if (isModel) return state.modelJobs?.[sourceName] || null;
      return state.insightJobs?.[sourceName] || state.modelJobs?.[sourceName] || null;
    })
  );

  const fields = useMemo(() => {
    if (!sourceData) return [];
    const propsMapping = sourceData.props_mapping || {};
    const keys = Object.keys(propsMapping);
    // Prefer the explicit props_mapping (every pivot-capable parent has one).
    // Fall back to the keys of the first loaded data row for plain model data.
    const rawNames = keys.length
      ? keys.map(k => k.replace(/^props\./, ''))
      : firstRowKeys(sourceData);
    const seen = new Set();
    const out = [];
    for (const name of rawNames) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, label: humaniseFieldName(name), source: sourceName });
    }
    return out;
  }, [sourceData, sourceName]);

  return { fields, sourceName, isLoading: isInsightsLoading };
};

function firstRowKeys(sourceData) {
  const data = sourceData?.data || sourceData?.insight;
  if (Array.isArray(data) && data.length > 0 && data[0]) {
    return Object.keys(data[0]).map(k => k.replace(/_hash_[a-f0-9]+$/i, ''));
  }
  return [];
}

function humaniseFieldName(name) {
  return name
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default usePivotPlaygroundFields;
