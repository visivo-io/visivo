/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
import {
  classifyTableData,
  classifyTableDataNames,
  pivotRefNames,
  selectTableSource,
} from './tableDataNames';

const registry = ({ models = [], insights = [], registriesLoading = false } = {}) => ({
  isKnownModel: name => models.includes(name),
  isKnownInsight: name => insights.includes(name),
  registriesLoading,
});

const pivot = name => ({
  columns: [`\${ref(${name}).region}`],
  rows: [`\${ref(${name}).month}`],
  values: [`sum(\${ref(${name}).amount})`],
});

describe('classifyTableData', () => {
  const isKnownModel = name => name === 'orders';

  it('returns null without a usable name', () => {
    expect(classifyTableData(null, isKnownModel)).toBeNull();
    expect(classifyTableData('', isKnownModel)).toBeNull();
    expect(classifyTableData({ sql: 'select 1' }, isKnownModel)).toBeNull();
  });

  it('classifies a string ref with the model registry', () => {
    expect(classifyTableData('${ref(orders)}', isKnownModel)).toEqual({
      name: 'orders',
      isModel: true,
    });
    expect(classifyTableData('${ref(revenue)}', isKnownModel)).toEqual({
      name: 'revenue',
      isModel: false,
    });
  });

  it.each([
    [{ name: 'm', sql: 'select 1' }, true],
    [{ name: 'm', args: ['echo'] }, true],
    [{ name: 'm', models: [] }, true],
    [{ name: 'i' }, false],
  ])('classifies an embedded object by its model signature', (data, isModel) => {
    expect(classifyTableData(data, isKnownModel)).toEqual({ name: data.name, isModel });
  });
});

describe('pivotRefNames', () => {
  it('collects each ref name once across columns, rows and values', () => {
    expect(
      pivotRefNames({
        columns: ['${ref(a).x}'],
        rows: ['${ref(b).y}'],
        values: ['sum(${ref(a).z})'],
      })
    ).toEqual(['a', 'b']);
  });

  it('returns nothing for a table without pivot fields', () => {
    expect(pivotRefNames(null)).toEqual([]);
    expect(pivotRefNames({})).toEqual([]);
  });
});

describe('classifyTableDataNames', () => {
  it('returns empty lists for no table and for default options', () => {
    expect(classifyTableDataNames(null)).toEqual({ insightNames: [], modelNames: [] });
  });

  it('sends a pivot ref to a registered insight to the insight hook only (VIS-1701)', () => {
    expect(classifyTableDataNames(pivot('revenue'), registry({ insights: ['revenue'] }))).toEqual({
      insightNames: ['revenue'],
      modelNames: [],
    });
  });

  it('sends a pivot ref to a registered model to the model hook only', () => {
    expect(classifyTableDataNames(pivot('orders'), registry({ models: ['orders'] }))).toEqual({
      insightNames: [],
      modelNames: ['orders'],
    });
  });

  it('sends an unlisted pivot ref to both hooks', () => {
    expect(classifyTableDataNames(pivot('unlisted'), registry())).toEqual({
      insightNames: ['unlisted'],
      modelNames: ['unlisted'],
    });
    expect(classifyTableDataNames(pivot('unlisted'))).toEqual({
      insightNames: ['unlisted'],
      modelNames: ['unlisted'],
    });
  });

  it('holds an unlisted pivot ref while a registry loads', () => {
    expect(
      classifyTableDataNames(pivot('unlisted'), registry({ registriesLoading: true }))
    ).toEqual({ insightNames: [], modelNames: [] });
  });

  it('reads a table record that carries its fields under config', () => {
    expect(
      classifyTableDataNames(
        { name: 'inline', config: { data: '${ref(orders)}', ...pivot('revenue') } },
        registry({ models: ['orders'], insights: ['revenue'] })
      )
    ).toEqual({ insightNames: ['revenue'], modelNames: ['orders'] });
  });

  it('still sends listed names while a registry loads', () => {
    expect(
      classifyTableDataNames(
        pivot('revenue'),
        registry({ insights: ['revenue'], registriesLoading: true })
      )
    ).toEqual({ insightNames: ['revenue'], modelNames: [] });
  });

  it('keeps a pivot ref with the bucket its data ref chose', () => {
    expect(
      classifyTableDataNames({ data: '${ref(revenue)}', ...pivot('revenue') }, registry())
    ).toEqual({ insightNames: ['revenue'], modelNames: [] });
    expect(
      classifyTableDataNames(
        { data: { name: 'inline', sql: 'select 1' }, ...pivot('inline') },
        registry()
      )
    ).toEqual({ insightNames: [], modelNames: ['inline'] });
  });
});

describe('selectTableSource', () => {
  const built = { name: 'x', data: [{ a: 1 }], files: [{ name_hash: 'h' }] };
  const missing = { name: 'x', data: null, missing: true };
  const loadError = { name: 'x', data: null, loadError: 'boom' };
  const pending = { name: 'x', data: null, pendingInputs: ['region'] };
  const emptyModel = { name: 'x', data: [], files: [], error: null };
  const builtModel = { name: 'x', data: [{ m: 1 }], files: [{ name_hash: 'm' }] };
  const lazyModel = { name: 'x', data: [], files: [{ name_hash: 'm' }] };
  const rowsOnlyModel = { name: 'x', data: [{ m: 1 }] };

  it('returns null without a name or without jobs', () => {
    expect(selectTableSource({ insightJobs: { x: built } }, null)).toBeNull();
    expect(selectTableSource({}, 'x')).toBeNull();
    expect(selectTableSource({ insightJobs: {}, modelJobs: {} }, 'x')).toBeNull();
  });

  it('reads only the model job for model data', () => {
    const state = { insightJobs: { x: built }, modelJobs: { x: builtModel } };
    expect(selectTableSource(state, 'x', { modelOnly: true })).toBe(builtModel);
    expect(selectTableSource({ insightJobs: { x: built } }, 'x', { modelOnly: true })).toBeNull();
  });

  it('prefers a built insight job over an empty model job', () => {
    expect(selectTableSource({ insightJobs: { x: built }, modelJobs: { x: emptyModel } }, 'x')).toBe(
      built
    );
  });

  it('keeps an insight job that waits for inputs', () => {
    expect(
      selectTableSource({ insightJobs: { x: pending }, modelJobs: { x: emptyModel } }, 'x')
    ).toBe(pending);
  });

  it.each([
    ['missing', missing],
    ['failed', loadError],
  ])('prefers a model job with output over a %s insight job', (_label, insightJob) => {
    [builtModel, lazyModel, rowsOnlyModel].forEach(modelJob => {
      expect(
        selectTableSource({ insightJobs: { x: insightJob }, modelJobs: { x: modelJob } }, 'x')
      ).toBe(modelJob);
    });
  });

  it('falls back to the insight job, then the model job, when neither has output', () => {
    expect(
      selectTableSource({ insightJobs: { x: missing }, modelJobs: { x: emptyModel } }, 'x')
    ).toBe(missing);
    expect(selectTableSource({ insightJobs: {}, modelJobs: { x: emptyModel } }, 'x')).toBe(
      emptyModel
    );
  });
});
