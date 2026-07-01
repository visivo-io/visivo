/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
/**
 * useFieldParentModel tests (VIS-1009).
 *
 * Resolves a dimension / metric's owning model. The owning model NAME comes from
 * the record's `parentModel` (the backend serialises model ownership there) or a
 * `${ref(model)}` on `config.model`; the model RECORD + its resolved source come
 * from the `models` / `sources` / `defaults` store collections.
 */
import { act, renderHook } from '@testing-library/react';
import useStore from '../../../../stores/store';
import { useFieldParentModel } from './useFieldParentModel';

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      models: overrides.models ?? [],
      sources: overrides.sources ?? [],
      defaults: overrides.defaults ?? null,
      fetchModels: jest.fn(),
      fetchSources: jest.fn(),
      fetchDefaults: jest.fn(),
    });
  });
};

describe('useFieldParentModel (VIS-1009)', () => {
  test('resolves the parent model from the record parentModel field', () => {
    seed({
      models: [{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(pg)}' } }],
    });
    const record = { name: 'x_rounded', parentModel: 'orders', config: { expression: 'ROUND(x, 2)' } };
    const { result } = renderHook(() => useFieldParentModel(record));

    expect(result.current.parentModelName).toBe('orders');
    expect(result.current.model).toMatchObject({ name: 'orders' });
    expect(result.current.modelConfig).toMatchObject({ sql: 'SELECT 1' });
    expect(result.current.sourceName).toBe('pg');
    expect(result.current.status).toBe('resolved');
  });

  test('falls back to config.model (a ${ref(model)}) when parentModel is absent', () => {
    seed({ models: [{ name: 'orders', config: { sql: 'SELECT 1' } }] });
    const record = { name: 'rev', config: { expression: 'SUM(amount)', model: '${ref(orders)}' } };
    const { result } = renderHook(() => useFieldParentModel(record));

    expect(result.current.parentModelName).toBe('orders');
    expect(result.current.status).toBe('resolved');
  });

  test('resolves the source from the project default when the model has none', () => {
    seed({
      models: [{ name: 'orders', config: { sql: 'SELECT 1' } }],
      sources: [{ name: 'first_source' }],
      defaults: { source_name: 'default_source' },
    });
    const record = { name: 'd', parentModel: 'orders', config: { expression: 'x' } };
    const { result } = renderHook(() => useFieldParentModel(record));
    expect(result.current.sourceName).toBe('default_source');
  });

  test('reports no-parent when the field has no model binding', () => {
    seed({ models: [{ name: 'orders' }] });
    const record = { name: 'orphan', config: { expression: 'x' } };
    const { result } = renderHook(() => useFieldParentModel(record));
    expect(result.current.parentModelName).toBeNull();
    expect(result.current.status).toBe('no-parent');
  });

  test('reports model-not-found when the parent model is missing from the collection', () => {
    seed({ models: [{ name: 'other' }] });
    const record = { name: 'd', parentModel: 'orders', config: { expression: 'x' } };
    const { result } = renderHook(() => useFieldParentModel(record));
    expect(result.current.status).toBe('model-not-found');
  });

  test('reports loading when there is no field record yet', () => {
    seed();
    const { result } = renderHook(() => useFieldParentModel(null));
    expect(result.current.status).toBe('loading');
  });
});
