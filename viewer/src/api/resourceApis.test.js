// Table-driven coverage for the per-type resource API modules. They share one
// shape: fetchAll{Type}s (list, project-scoped), fetch{Type} (detail, 404→null),
// save{Type} (detail POST), delete{Type} (detail DELETE), validate{Type}.
// csv-script / local-merge models have no single-item fetch.
import * as charts from './charts';
import * as sources from './sources';
import * as dimensions from './dimensions';
import * as metrics from './metrics';
import * as relations from './relations';
import * as models from './models';
import * as csvScriptModels from './csvScriptModels';
import * as localMergeModels from './localMergeModels';
import * as markdowns from './markdowns';
import * as inputs from './inputs';
import * as insights from './insights';
import * as tables from './tables';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params) => `/api/${key}${params && params.name ? `/${params.name}` : ''}`,
}));

const ok = data => ({ status: 200, json: async () => data });
const notFound = () => ({ status: 404, json: async () => ({}) });
const fail = (status, data = {}) => ({ status, json: async () => data });

const CASES = [
  {
    name: 'charts',
    fetchAll: charts.fetchAllCharts,
    fetchOne: charts.fetchChart,
    save: charts.saveChart,
    del: charts.deleteChart,
    validate: charts.validateChart,
  },
  {
    name: 'sources',
    fetchAll: sources.fetchAllSources,
    fetchOne: sources.fetchSource,
    save: sources.saveSource,
    del: sources.deleteSource,
    validate: sources.validateSource,
  },
  {
    name: 'dimensions',
    fetchAll: dimensions.fetchAllDimensions,
    fetchOne: dimensions.fetchDimension,
    save: dimensions.saveDimension,
    del: dimensions.deleteDimension,
    validate: dimensions.validateDimension,
  },
  {
    name: 'metrics',
    fetchAll: metrics.fetchAllMetrics,
    fetchOne: metrics.fetchMetric,
    save: metrics.saveMetric,
    del: metrics.deleteMetric,
    validate: metrics.validateMetric,
  },
  {
    name: 'relations',
    fetchAll: relations.fetchAllRelations,
    fetchOne: relations.fetchRelation,
    save: relations.saveRelation,
    del: relations.deleteRelation,
    validate: relations.validateRelation,
  },
  {
    name: 'models',
    fetchAll: models.fetchAllModels,
    fetchOne: models.fetchModel,
    save: models.saveModel,
    del: models.deleteModel,
    validate: models.validateModel,
  },
  {
    name: 'csvScriptModels',
    fetchAll: csvScriptModels.fetchAllCsvScriptModels,
    fetchOne: null,
    save: csvScriptModels.saveCsvScriptModel,
    del: csvScriptModels.deleteCsvScriptModel,
    validate: csvScriptModels.validateCsvScriptModel,
  },
  {
    name: 'localMergeModels',
    fetchAll: localMergeModels.fetchAllLocalMergeModels,
    fetchOne: null,
    save: localMergeModels.saveLocalMergeModel,
    del: localMergeModels.deleteLocalMergeModel,
    validate: localMergeModels.validateLocalMergeModel,
  },
  {
    name: 'markdowns',
    fetchAll: markdowns.fetchAllMarkdowns,
    fetchOne: markdowns.fetchMarkdown,
    save: markdowns.saveMarkdown,
    del: markdowns.deleteMarkdown,
    validate: markdowns.validateMarkdown,
  },
  {
    name: 'inputs',
    fetchAll: inputs.fetchAllInputs,
    fetchOne: inputs.fetchInput,
    save: inputs.saveInput,
    del: inputs.deleteInput,
    validate: inputs.validateInput,
  },
  {
    name: 'insights',
    fetchAll: insights.fetchAllInsights,
    fetchOne: insights.fetchInsight,
    save: insights.saveInsight,
    del: insights.deleteInsight,
    validate: insights.validateInsight,
  },
  {
    name: 'tables',
    fetchAll: tables.fetchAllTables,
    fetchOne: tables.fetchTable,
    save: tables.saveTable,
    del: tables.deleteTable,
    validate: tables.validateTable,
  },
];

describe('per-type resource API modules', () => {
  beforeEach(() => apiFetch.mockReset());

  describe.each(CASES)('$name', ({ fetchAll, fetchOne, save, del, validate }) => {
    it('fetchAll returns json on 200 and scopes by project_id', async () => {
      apiFetch.mockResolvedValueOnce(ok({ items: [] }));
      await expect(fetchAll('proj-1')).resolves.toEqual({ items: [] });
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'));
    });

    it('fetchAll omits the query string when no project id', async () => {
      apiFetch.mockResolvedValueOnce(ok([]));
      await fetchAll();
      expect(apiFetch).toHaveBeenCalledWith(expect.not.stringContaining('project_id'));
    });

    it('fetchAll throws on a non-200', async () => {
      apiFetch.mockResolvedValueOnce(fail(500));
      await expect(fetchAll()).rejects.toThrow();
    });

    const maybeIt = fetchOne ? it : it.skip;
    maybeIt('fetchOne returns json (200), null (404), throws otherwise', async () => {
      apiFetch.mockResolvedValueOnce(ok({ name: 'x' }));
      await expect(fetchOne('x')).resolves.toEqual({ name: 'x' });
      apiFetch.mockResolvedValueOnce(notFound());
      await expect(fetchOne('x')).resolves.toBeNull();
      apiFetch.mockResolvedValueOnce(fail(500));
      await expect(fetchOne('x')).rejects.toThrow();
    });

    it('save POSTs the JSON config and returns json on 200', async () => {
      apiFetch.mockResolvedValueOnce(ok({ saved: true }));
      await expect(save('x', { a: 1 })).resolves.toEqual({ saved: true });
      expect(apiFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) })
      );
    });

    it('save scopes by project_id when one is given, and omits it otherwise', async () => {
      apiFetch.mockResolvedValueOnce(ok({ saved: true }));
      await save('x', { a: 1 }, 'proj-1');
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('project_id=proj-1'),
        expect.objectContaining({ method: 'POST' })
      );
      apiFetch.mockResolvedValueOnce(ok({ saved: true }));
      await save('x', { a: 1 });
      expect(apiFetch).toHaveBeenLastCalledWith(
        expect.not.stringContaining('project_id'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it("save surfaces the server's error message on failure", async () => {
      apiFetch.mockResolvedValueOnce(fail(400, { error: 'bad config' }));
      await expect(save('x', {})).rejects.toThrow('bad config');
    });

    it('delete sends DELETE and returns json on 200, throws otherwise', async () => {
      apiFetch.mockResolvedValueOnce(ok({ deleted: true }));
      await expect(del('x')).resolves.toEqual({ deleted: true });
      expect(apiFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
      apiFetch.mockResolvedValueOnce(fail(500));
      await expect(del('x')).rejects.toThrow();
    });

    it('delete scopes by project_id when one is given', async () => {
      apiFetch.mockResolvedValueOnce(ok({ deleted: true }));
      await del('x', 'proj-1');
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('project_id=proj-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('validate returns the parsed body regardless of status', async () => {
      apiFetch.mockResolvedValueOnce(ok({ valid: true }));
      await expect(validate('x', {})).resolves.toEqual({ valid: true });
    });
  });

  it('sources.testSourceConnection returns failure shape on a non-200', async () => {
    apiFetch.mockResolvedValueOnce(fail(400, { error: 'no reach' }));
    await expect(sources.testSourceConnection({})).resolves.toEqual({
      status: 'connection_failed',
      error: 'no reach',
    });
  });
});
