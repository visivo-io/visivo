/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * refPreflight (VIS-993 layer 2, sync half) — dangling-ref detection.
 *
 * A `${ref(name)}` pointing at nothing is schema-valid but semantically doomed:
 * under runs-on-changes it caches fine and then fails a real DAG run (and in
 * cloud, blocks Commit on run_failed). The pre-flight blocks persistence for
 * the high-confidence case only: the name is absent from EVERY populated store
 * collection. When nothing is loaded yet (boot, lazy stores) it fails open —
 * the backend and the run remain the net.
 */
import { checkRefTargets } from './refPreflight';

const stateWith = collections => ({
  charts: [],
  insights: [],
  models: [],
  csvScriptModels: [],
  localMergeModels: [],
  tables: [],
  markdowns: [],
  inputs: [],
  sources: [],
  dimensions: [],
  metrics: [],
  relations: [],
  dashboards: [],
  ...collections,
});

describe('checkRefTargets', () => {
  test('a ref to an existing object passes', () => {
    const state = stateWith({ insights: [{ name: 'revenue_insight' }] });
    const result = checkRefTargets({ insights: ['${ref(revenue_insight)}'] }, state);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('a dangling ref is reported with its config path and name', () => {
    const state = stateWith({ insights: [{ name: 'revenue_insight' }] });
    const result = checkRefTargets({ insights: ['${ref(missing_insight)}'] }, state);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      path: 'insights.0',
      keyword: 'ref',
    });
    expect(result.errors[0].message).toMatch(/missing_insight/);
  });

  test('refs resolve across ALL collections, not just the field-adjacent one', () => {
    const state = stateWith({ models: [{ name: 'orders' }] });
    const result = checkRefTargets({ chart: '${ref(orders)}' }, state);
    expect(result.valid).toBe(true);
  });

  test('nested objects and bare ref(name) strings are walked too', () => {
    const state = stateWith({ charts: [{ name: 'c1' }] });
    const result = checkRefTargets(
      { rows: [{ items: [{ chart: 'ref(ghost)' }] }] },
      state
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('rows.0.items.0.chart');
    expect(result.errors[0].message).toMatch(/ghost/);
  });

  test('fails open when no collections are populated (boot / lazy stores)', () => {
    const result = checkRefTargets({ chart: '${ref(anything)}' }, stateWith({}));
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });

  test('non-ref strings, ${...} context strings, and ?{} query strings are ignored', () => {
    const state = stateWith({ charts: [{ name: 'c1' }] });
    const result = checkRefTargets(
      {
        content: 'plain text with ref-ish words',
        x: '?{ sum(amount) }',
        label: '${input.picker.value}',
      },
      state
    );
    expect(result.valid).toBe(true);
  });

  test('quoted and spaced ref names resolve', () => {
    const state = stateWith({ charts: [{ name: 'My Chart' }] });
    const result = checkRefTargets({ chart: "${ref('My Chart')}" }, state);
    expect(result.valid).toBe(true);
  });
});
