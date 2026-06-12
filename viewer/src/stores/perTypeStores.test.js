// Coverage for the per-type Zustand slices (chart/dimension/metric/relation/
// model/input/insight/table/markdown/source/csv-script/local-merge). They share
// one shape: fetch<Plural> → set list, save/delete → call api + refresh + commit
// check, modal open/close, and getByName/getStatus selectors. The two model
// variants and `source` differ slightly (no per-item modal, generic modal names,
// connection helpers); the test discovers each slice's action + state keys
// dynamically so it adapts rather than hard-coding ~100 names.
import createChartSlice from './chartStore';
import createDimensionSlice from './dimensionStore';
import createMetricSlice from './metricStore';
import createRelationSlice from './relationStore';
import createModelSlice from './modelStore';
import createSourceSlice from './sourceStore';
import createInputSlice from './inputStore';
import createInsightSlice from './insightStore';
import createTableSlice from './tableStore';
import createMarkdownSlice from './markdownStore';
import createCsvScriptModelSlice from './csvScriptModelStore';
import createLocalMergeModelSlice from './localMergeModelStore';
import * as chartsApi from '../api/charts';
import * as dimensionsApi from '../api/dimensions';
import * as metricsApi from '../api/metrics';
import * as relationsApi from '../api/relations';
import * as modelsApi from '../api/models';
import * as sourcesApi from '../api/sources';
import * as inputsApi from '../api/inputs';
import * as insightsApi from '../api/insights';
import * as tablesApi from '../api/tables';
import * as markdownsApi from '../api/markdowns';
import * as csvScriptModelsApi from '../api/csvScriptModels';
import * as localMergeModelsApi from '../api/localMergeModels';

jest.mock('../api/charts');
jest.mock('../api/dimensions');
jest.mock('../api/metrics');
jest.mock('../api/relations');
jest.mock('../api/models');
jest.mock('../api/sources');
jest.mock('../api/inputs');
jest.mock('../api/insights');
jest.mock('../api/tables');
jest.mock('../api/markdowns');
jest.mock('../api/csvScriptModels');
jest.mock('../api/localMergeModels');

// Minimal stand-in for a zustand store: compose the slice over a mutable state
// object with set/get, exactly as zustand's create() would.
const makeStore = (slice, initial = {}) => {
  let state = { ...initial };
  const set = patch => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = { ...state, ...slice(set, get) };
  return { get };
};

const fnKey = (obj, re) => Object.keys(obj).find(k => re.test(k) && typeof obj[k] === 'function');

const STORES = [
  { name: 'chart', slice: createChartSlice, api: chartsApi },
  { name: 'dimension', slice: createDimensionSlice, api: dimensionsApi },
  { name: 'metric', slice: createMetricSlice, api: metricsApi },
  { name: 'relation', slice: createRelationSlice, api: relationsApi },
  { name: 'model', slice: createModelSlice, api: modelsApi },
  { name: 'source', slice: createSourceSlice, api: sourcesApi },
  { name: 'input', slice: createInputSlice, api: inputsApi },
  { name: 'insight', slice: createInsightSlice, api: insightsApi },
  { name: 'table', slice: createTableSlice, api: tablesApi },
  { name: 'markdown', slice: createMarkdownSlice, api: markdownsApi },
  // These two map a snake_case api payload key onto a camelCase state key.
  { name: 'csvScriptModel', slice: createCsvScriptModelSlice, api: csvScriptModelsApi, dataKey: 'csv_script_models' },
  { name: 'localMergeModel', slice: createLocalMergeModelSlice, api: localMergeModelsApi, dataKey: 'local_merge_models' },
];

describe.each(STORES)('$name store slice', ({ slice, api, dataKey }) => {
  let store;
  let listKey, loadingKey, errorKey, editingKey, modalKey;
  let fetchFn, saveFn, deleteFn, openEditFn, openCreateFn, closeFn, getByNameFn, getStatusFn;
  let fetchAllName, saveApiName, deleteApiName;

  beforeEach(() => {
    jest.clearAllMocks();
    store = makeStore(slice, { project: { id: 'proj-1' } });
    const s = store.get();

    listKey = Object.keys(s).find(k => Array.isArray(s[k]));
    loadingKey = Object.keys(s).find(k => /Loading$/.test(k));
    errorKey = Object.keys(s).find(k => /Error$/.test(k));
    editingKey = Object.keys(s).find(k => /^editing/.test(k));
    modalKey = Object.keys(s).find(k => /ModalOpen$/.test(k));

    fetchFn = fnKey(s, /^fetch/);
    saveFn = fnKey(s, /^save/);
    deleteFn = fnKey(s, /^delete/);
    openEditFn = fnKey(s, /^openEdit/);
    openCreateFn = fnKey(s, /^openCreate/);
    closeFn = fnKey(s, /^close.*Modal$/);
    getByNameFn = fnKey(s, /^get.*ByName$/);
    getStatusFn = fnKey(s, /^get.*Status$/);

    fetchAllName = fnKey(api, /^fetchAll/);
    saveApiName = fnKey(api, /^save/);
    deleteApiName = fnKey(api, /^delete/);

    api[fetchAllName].mockResolvedValue({ [dataKey || listKey]: [{ name: 'x', status: 'NEW' }] });
    api[saveApiName].mockResolvedValue({ ok: true });
    api[deleteApiName].mockResolvedValue({ ok: true });
  });

  it('fetch populates the list from the project-scoped api and clears loading', async () => {
    await store.get()[fetchFn]();
    expect(api[fetchAllName]).toHaveBeenCalledWith('proj-1');
    expect(store.get()[listKey]).toEqual([{ name: 'x', status: 'NEW' }]);
    expect(store.get()[loadingKey]).toBe(false);
  });

  it('fetch records the error message and clears loading on failure', async () => {
    api[fetchAllName].mockRejectedValueOnce(new Error('boom'));
    await store.get()[fetchFn]();
    expect(store.get()[errorKey]).toBe('boom');
    expect(store.get()[loadingKey]).toBe(false);
  });

  it('save calls the api and returns success', async () => {
    const res = await store.get()[saveFn]('x', { a: 1 });
    expect(api[saveApiName]).toHaveBeenCalledWith('x', { a: 1 });
    expect(res.success).toBe(true);
  });

  it('save returns the failure shape when the api throws', async () => {
    api[saveApiName].mockRejectedValueOnce(new Error('nope'));
    const res = await store.get()[saveFn]('x', {});
    expect(res).toEqual({ success: false, error: 'nope' });
  });

  it('delete calls the api and returns success', async () => {
    const res = await store.get()[deleteFn]('x');
    expect(api[deleteApiName]).toHaveBeenCalledWith('x');
    expect(res.success).toBe(true);
  });

  it('delete returns the failure shape when the api throws', async () => {
    api[deleteApiName].mockRejectedValueOnce(new Error('locked'));
    const res = await store.get()[deleteFn]('x');
    expect(res).toEqual({ success: false, error: 'locked' });
  });

  it('opens the create modal in create mode and closes it', () => {
    if (!openCreateFn) return; // model-variant stores have no modal
    store.get()[openCreateFn]();
    expect(store.get()[modalKey]).toBe(true);
    expect(store.get()[editingKey]).toBeNull();
    store.get()[closeFn]();
    expect(store.get()[modalKey]).toBe(false);
  });

  it('opens the edit modal with the target object', () => {
    if (!openEditFn) return;
    store.get()[openEditFn]({ name: 'x' });
    expect(store.get()[editingKey]).toEqual({ name: 'x' });
    expect(store.get()[modalKey]).toBe(true);
  });

  it('getByName / getStatus resolve a fetched item', async () => {
    if (!getByNameFn) return;
    await store.get()[fetchFn]();
    expect(store.get()[getByNameFn]('x')).toEqual({ name: 'x', status: 'NEW' });
    expect(store.get()[getStatusFn]('x')).toBe('NEW');
    expect(store.get()[getStatusFn]('missing')).toBeNull();
  });
});
