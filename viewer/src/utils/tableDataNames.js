import { parseRefValue, extractRefNamesFromStrings } from './refString';

const hasModelSignature = data => !!(data && (data.sql || data.args || data.models));

/**
 * Classify a table's `data` ref. A string ref carries no type, so the model
 * registry decides; an embedded object is a model when it has a model signature.
 *
 * @returns {{ name: string, isModel: boolean } | null}
 */
export const classifyTableData = (tableData, isKnownModel) => {
  if (!tableData) return null;
  if (typeof tableData === 'string') {
    const name = parseRefValue(tableData);
    if (!name) return null;
    return { name, isModel: isKnownModel(name) };
  }
  const name = tableData?.name;
  if (!name) return null;
  return { name, isModel: hasModelSignature(tableData) };
};

export const pivotRefNames = table =>
  extractRefNamesFromStrings([
    ...(table?.columns || []),
    ...(table?.rows || []),
    ...(table?.values || []),
  ]);

/**
 * Sort every data name a table reads into the hook that can load it.
 *
 * A pivot ref names an insight or a model, and the ref string does not say
 * which. The registries decide. A name that neither registry lists goes to both
 * hooks, because a dist build has no registry; `selectTableSource` then picks
 * the job that has output. While a registry loads, an unlisted name waits.
 *
 * @returns {{ insightNames: string[], modelNames: string[] }}
 */
export const classifyTableDataNames = (
  table,
  { isKnownModel = () => false, isKnownInsight = () => false, registriesLoading = false } = {}
) => {
  const insightNames = new Set();
  const modelNames = new Set();

  const data = classifyTableData(table?.data, isKnownModel);
  if (data) (data.isModel ? modelNames : insightNames).add(data.name);

  pivotRefNames(table).forEach(name => {
    if (isKnownInsight(name) || insightNames.has(name)) {
      insightNames.add(name);
    } else if (isKnownModel(name) || modelNames.has(name)) {
      modelNames.add(name);
    } else if (!registriesLoading) {
      insightNames.add(name);
      modelNames.add(name);
    }
  });

  return { insightNames: [...insightNames], modelNames: [...modelNames] };
};

const hasNoOutput = job => !job || (job.data == null && (job.missing || job.loadError));

/**
 * Pick the store job a table renders from. An insight job with no built output
 * must not hide a model job of the same name, and a model job with no files
 * must not hide an insight job.
 */
export const selectTableSource = (state, name, { modelOnly = false } = {}) => {
  if (!name) return null;
  const modelJob = state.modelJobs?.[name] || null;
  if (modelOnly) return modelJob;
  const insightJob = state.insightJobs?.[name] || null;
  if (!hasNoOutput(insightJob)) return insightJob;
  if (modelJob?.files?.length || modelJob?.data?.length) return modelJob;
  return insightJob || modelJob;
};
