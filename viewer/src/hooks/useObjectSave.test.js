/**
 * useObjectSave — the unified save router used by the edit panels.
 *
 * Standalone objects route to the per-type store save function (13 arms) and
 * fire onSuccessfulSave only when the save succeeds. Embedded objects with an
 * applyToParent updater never hit the backend: the parent's config is patched
 * in the edit stack and the current entry is popped.
 *
 * Pattern per store tests: real store module, save functions injected via
 * useStore.setState (flat namespace).
 */
import { renderHook } from '@testing-library/react';
import { useObjectSave } from './useObjectSave';
import useStore from '../stores/store';

const TYPE_TO_SAVE_FN = {
  source: 'saveSource',
  model: 'saveModel',
  dimension: 'saveDimension',
  metric: 'saveMetric',
  relation: 'saveRelation',
  insight: 'saveInsight',
  markdown: 'saveMarkdown',
  chart: 'saveChart',
  table: 'saveTable',
  dashboard: 'saveDashboard',
  csvScriptModel: 'saveCsvScriptModel',
  localMergeModel: 'saveLocalMergeModel',
  input: 'saveInput',
};

describe('useObjectSave', () => {
  let saveFns;

  beforeEach(() => {
    saveFns = Object.fromEntries(
      Object.values(TYPE_TO_SAVE_FN).map(fnName => [
        fnName,
        jest.fn().mockResolvedValue({ success: true }),
      ])
    );
    useStore.setState(saveFns);
  });

  const renderSaveHook = (currentEdit = null, setEditStack = jest.fn(), onSuccessfulSave) =>
    renderHook(() => useObjectSave(currentEdit, setEditStack, onSuccessfulSave));

  describe('standalone saves route to the per-type store function', () => {
    test.each(Object.entries(TYPE_TO_SAVE_FN))(
      'type "%s" calls %s with (name, config) and returns its result',
      async (type, fnName) => {
        const { result } = renderSaveHook();
        const config = { some: 'config' };

        const saveResult = await result.current(type, 'my-object', config);

        expect(saveFns[fnName]).toHaveBeenCalledWith('my-object', config);
        expect(saveResult).toEqual({ success: true });

        // No other save function fired
        Object.entries(saveFns)
          .filter(([name]) => name !== fnName)
          .forEach(([, fn]) => expect(fn).not.toHaveBeenCalled());
      }
    );

    test('unknown type returns a failure result without calling any save function', async () => {
      const onSuccessfulSave = jest.fn();
      const { result } = renderSaveHook(null, jest.fn(), onSuccessfulSave);

      const saveResult = await result.current('widget', 'w1', {});

      expect(saveResult).toEqual({ success: false, error: 'Unknown object type: widget' });
      Object.values(saveFns).forEach(fn => expect(fn).not.toHaveBeenCalled());
      expect(onSuccessfulSave).not.toHaveBeenCalled();
    });
  });

  describe('onSuccessfulSave callback', () => {
    test('fires after a successful save', async () => {
      const onSuccessfulSave = jest.fn().mockResolvedValue(undefined);
      const { result } = renderSaveHook(null, jest.fn(), onSuccessfulSave);

      await result.current('model', 'orders', { sql: 'SELECT 1' });

      expect(onSuccessfulSave).toHaveBeenCalledTimes(1);
    });

    test('does not fire when the save fails', async () => {
      saveFns.saveModel.mockResolvedValue({ success: false, error: 'validation failed' });
      const onSuccessfulSave = jest.fn();
      const { result } = renderSaveHook(null, jest.fn(), onSuccessfulSave);

      const saveResult = await result.current('model', 'orders', {});

      expect(saveResult).toEqual({ success: false, error: 'validation failed' });
      expect(onSuccessfulSave).not.toHaveBeenCalled();
    });

    test('does not fire (and does not throw) when the save resolves undefined', async () => {
      saveFns.saveChart.mockResolvedValue(undefined);
      const onSuccessfulSave = jest.fn();
      const { result } = renderSaveHook(null, jest.fn(), onSuccessfulSave);

      const saveResult = await result.current('chart', 'c1', {});

      expect(saveResult).toBeUndefined();
      expect(onSuccessfulSave).not.toHaveBeenCalled();
    });

    test('successful save works without a callback', async () => {
      const { result } = renderSaveHook(null, jest.fn(), undefined);
      await expect(result.current('table', 't1', {})).resolves.toEqual({ success: true });
    });
  });

  describe('embedded objects with applyToParent', () => {
    const makeEmbeddedEdit = applyToParent => ({
      object: { _embedded: { parentType: 'chart' }, config: { name: 'child' } },
      applyToParent,
    });

    test('patches the parent config in the stack and pops the current entry (no backend save)', async () => {
      const applyToParent = jest.fn((parentConfig, childConfig) => ({
        ...parentConfig,
        insight: childConfig,
      }));
      const setEditStack = jest.fn();
      const { result } = renderSaveHook(makeEmbeddedEdit(applyToParent), setEditStack);

      const saveResult = await result.current('insight', 'child', { props: { x: 1 } });

      expect(saveResult).toEqual({ success: true });
      Object.values(saveFns).forEach(fn => expect(fn).not.toHaveBeenCalled());
      expect(setEditStack).toHaveBeenCalledTimes(1);

      // Apply the functional updater to a representative stack: [parent, child]
      const updater = setEditStack.mock.calls[0][0];
      const prevStack = [
        { object: { type: 'chart', config: { name: 'parent-chart' } } },
        { object: { _embedded: { parentType: 'chart' }, config: { name: 'child' } } },
      ];
      const newStack = updater(prevStack);

      expect(applyToParent).toHaveBeenCalledWith({ name: 'parent-chart' }, { props: { x: 1 } });
      expect(newStack).toHaveLength(1);
      expect(newStack[0].object.config).toEqual({
        name: 'parent-chart',
        insight: { props: { x: 1 } },
      });
      // Prev stack entries are not mutated
      expect(prevStack[0].object.config).toEqual({ name: 'parent-chart' });
    });

    test('pops the only entry without patching when there is no parent in the stack', async () => {
      const applyToParent = jest.fn();
      const setEditStack = jest.fn();
      const { result } = renderSaveHook(makeEmbeddedEdit(applyToParent), setEditStack);

      await result.current('insight', 'child', {});

      const updater = setEditStack.mock.calls[0][0];
      const newStack = updater([{ object: { _embedded: {}, config: {} } }]);

      expect(newStack).toEqual([]);
      expect(applyToParent).not.toHaveBeenCalled();
    });

    test('embedded object WITHOUT applyToParent falls through to a standalone save', async () => {
      const setEditStack = jest.fn();
      const currentEdit = { object: { _embedded: { parentType: 'chart' }, config: {} } };
      const { result } = renderSaveHook(currentEdit, setEditStack);

      const saveResult = await result.current('insight', 'child', { props: {} });

      expect(saveFns.saveInsight).toHaveBeenCalledWith('child', { props: {} });
      expect(setEditStack).not.toHaveBeenCalled();
      expect(saveResult).toEqual({ success: true });
    });

    test('non-embedded currentEdit with applyToParent still saves standalone', async () => {
      const setEditStack = jest.fn();
      const currentEdit = {
        object: { type: 'insight', config: {} },
        applyToParent: jest.fn(),
      };
      const { result } = renderSaveHook(currentEdit, setEditStack);

      await result.current('insight', 'solo', {});

      expect(saveFns.saveInsight).toHaveBeenCalledWith('solo', {});
      expect(setEditStack).not.toHaveBeenCalled();
    });
  });
});
