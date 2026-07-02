/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * PivotPlayground (VIS-1008).
 *
 * The editable `build` lens body. We mock the three panes + the field hook to
 * keep this a focused test of the playground's OWN responsibilities:
 *   - seeding the local draft from the table record's existing pivot config;
 *   - mirroring the draft into the workspace store;
 *   - reporting dirtiness to the frame via ObjectCanvasDirtyContext;
 *   - committing through the store's commitWorkspacePivotDraft on Save.
 *
 * The shelves are mocked to expose a button that fires their `onDropField`, so
 * we can drive a draft mutation without simulating a real dnd-kit drag (which
 * jsdom cannot do).
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import PivotPlayground from './PivotPlayground';
import useStore from '../../../../stores/store';
import { ObjectCanvasDirtyContext } from '../ObjectCanvasFrame';

const mockFields = [{ name: 'revenue', source: 'sales-insight', label: 'Revenue' }];
jest.mock('./usePivotPlaygroundFields', () => ({
  __esModule: true,
  default: () => ({ fields: mockFields, sourceName: 'sales-insight', isLoading: false }),
}));

jest.mock('./PivotFieldList', () => ({
  __esModule: true,
  default: ({ fields }) => <div data-testid="field-list-mock">{fields.length} fields</div>,
}));

jest.mock('./PivotResultPanel', () => ({
  __esModule: true,
  default: ({ config }) => (
    <div data-testid="result-mock">{config ? 'has-config' : 'no-config'}</div>
  ),
}));

// Each mocked shelf renders buttons that fire its onDropField / onRemoveChip /
// onAggChange callbacks — enough to mutate the draft without a real dnd drag.
jest.mock('./PivotShelf', () => ({
  __esModule: true,
  AGGREGATIONS: ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'],
  default: ({ shelf, chips, onDropField, onRemoveChip, onAggChange }) => (
    <div data-testid={`shelf-mock-${shelf}`}>
      <span data-testid={`shelf-mock-${shelf}-count`}>{chips.length}</span>
      <button
        type="button"
        data-testid={`shelf-mock-${shelf}-drop`}
        onClick={() => onDropField({ name: 'revenue', source: 'sales-insight', label: 'Revenue' })}
      >
        drop
      </button>
      <button
        type="button"
        data-testid={`shelf-mock-${shelf}-remove-first`}
        onClick={() => onRemoveChip && onRemoveChip(0)}
      >
        remove
      </button>
      {onAggChange && (
        <button
          type="button"
          data-testid={`shelf-mock-${shelf}-agg-avg`}
          onClick={() => onAggChange(0, 'avg')}
        >
          avg
        </button>
      )}
    </div>
  ),
}));

const renderPlayground = (overrides = {}) => {
  const setDirty = overrides.setDirty || jest.fn();
  const ctx = { dirty: false, setDirty };
  const utils = render(
    <ObjectCanvasDirtyContext.Provider value={ctx}>
      <PivotPlayground
        activeObject={overrides.activeObject || { type: 'table', name: 'sales-pivot-table' }}
        projectId="proj-1"
        record={overrides.record}
      />
    </ObjectCanvasDirtyContext.Provider>
  );
  return { setDirty, ...utils };
};

beforeEach(() => {
  act(() => {
    useStore.setState({
      workspacePivotDraft: null,
      tables: [],
      saveTable: jest.fn(() => Promise.resolve({ success: true })),
    });
  });
});

describe('PivotPlayground (VIS-1008)', () => {
  test('renders the three panes (field list, shelves, result)', () => {
    renderPlayground({ record: { name: 'sales-pivot-table' } });
    expect(screen.getByTestId('pivot-playground')).toBeInTheDocument();
    expect(screen.getByTestId('field-list-mock')).toBeInTheDocument();
    expect(screen.getByTestId('shelf-mock-columns')).toBeInTheDocument();
    expect(screen.getByTestId('shelf-mock-rows')).toBeInTheDocument();
    expect(screen.getByTestId('shelf-mock-values')).toBeInTheDocument();
    expect(screen.getByTestId('result-mock')).toBeInTheDocument();
  });

  test('seeds the draft from the table record existing pivot config', () => {
    renderPlayground({
      record: {
        name: 'sales-pivot-table',
        columns: ['${ref(sales-insight).region}'],
        rows: ['${ref(sales-insight).category}'],
        values: ['sum(${ref(sales-insight).revenue})'],
      },
    });
    expect(screen.getByTestId('shelf-mock-columns-count')).toHaveTextContent('1');
    expect(screen.getByTestId('shelf-mock-rows-count')).toHaveTextContent('1');
    expect(screen.getByTestId('shelf-mock-values-count')).toHaveTextContent('1');
    // A seeded full pivot produces a runnable config for the result pane.
    expect(screen.getByTestId('result-mock')).toHaveTextContent('has-config');
  });

  test('mirrors the seeded draft into the workspace store', () => {
    renderPlayground({
      record: { name: 'sales-pivot-table', columns: ['${ref(sales-insight).region}'] },
    });
    const draft = useStore.getState().workspacePivotDraft;
    expect(draft.tableName).toBe('sales-pivot-table');
    expect(draft.columns).toEqual(['${ref(sales-insight).region}']);
  });

  test('reports clean on seed and dirty after a drop mutates the draft', () => {
    const setDirty = jest.fn();
    renderPlayground({ record: { name: 'sales-pivot-table' }, setDirty });
    // Initial seed (empty record) → clean.
    expect(setDirty).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    // Dropping a field diverges from the saved (empty) config → dirty.
    expect(setDirty).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('shelf-mock-columns-count')).toHaveTextContent('1');
  });

  test('Save is disabled when clean and opens the replace/add-new modal when dirty', async () => {
    const saveTable = jest.fn(() => Promise.resolve({ success: true }));
    act(() => {
      useStore.setState({
        saveTable,
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    const save = screen.getByTestId('pivot-playground-save');
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    expect(save).not.toBeDisabled();

    // Save no longer commits silently — it opens the choice modal.
    fireEvent.click(save);
    expect(screen.getByTestId('pivot-save-modal')).toBeInTheDocument();
    expect(saveTable).not.toHaveBeenCalled();
    expect(screen.getByTestId('pivot-save-replace')).toBeInTheDocument();
    expect(screen.getByTestId('pivot-save-add-new')).toBeInTheDocument();
  });

  test('Replace commits the draft over the current table', async () => {
    const saveTable = jest.fn(() => Promise.resolve({ success: true }));
    act(() => {
      useStore.setState({
        saveTable,
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('pivot-playground-save'));
    fireEvent.click(screen.getByTestId('pivot-save-replace'));

    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    const [name, config] = saveTable.mock.calls[0];
    expect(name).toBe('sales-pivot-table');
    expect(config.columns).toEqual(['${ref(sales-insight).revenue}']);
    // Modal closes after the save resolves.
    await waitFor(() =>
      expect(screen.queryByTestId('pivot-save-modal')).not.toBeInTheDocument()
    );
  });

  test('Add as new creates a brand-new uniquely-named table and opens it', async () => {
    const saveTable = jest.fn(() => Promise.resolve({ success: true }));
    const openWorkspaceTab = jest.fn();
    act(() => {
      useStore.setState({
        saveTable,
        openWorkspaceTab,
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('pivot-playground-save'));
    fireEvent.click(screen.getByTestId('pivot-save-add-new'));

    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    const [newName, config] = saveTable.mock.calls[0];
    // A NEW name, distinct from the source table.
    expect(newName).not.toBe('sales-pivot-table');
    expect(newName).toContain('sales-pivot-table');
    expect(config.name).toBe(newName);
    expect(config.columns).toEqual(['${ref(sales-insight).revenue}']);
    // The new table is opened as a workspace tab.
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({ type: 'table', name: newName })
    );
  });

  test('a failed Replace keeps the modal open and surfaces the error', async () => {
    // saveTable never throws — failures resolve as { success: false, error }.
    const saveTable = jest.fn(() =>
      Promise.resolve({ success: false, error: 'data conflicts with pivot config' })
    );
    act(() => {
      useStore.setState({
        saveTable,
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('pivot-playground-save'));
    fireEvent.click(screen.getByTestId('pivot-save-replace'));

    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    // The modal stays open with the error visible instead of silently closing.
    expect(await screen.findByTestId('pivot-save-error')).toHaveTextContent(
      'data conflicts with pivot config'
    );
    expect(screen.getByTestId('pivot-save-modal')).toBeInTheDocument();
  });

  test('a failed Add-as-new keeps the modal open and surfaces the error', async () => {
    const saveTable = jest.fn(() => Promise.resolve({ success: false, error: 'nope' }));
    act(() => {
      useStore.setState({
        saveTable,
        openWorkspaceTab: jest.fn(),
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('pivot-playground-save'));
    fireEvent.click(screen.getByTestId('pivot-save-add-new'));

    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('pivot-save-error')).toHaveTextContent('nope');
    expect(screen.getByTestId('pivot-save-modal')).toBeInTheDocument();
  });

  test('renders the empty state when no table is selected', () => {
    renderPlayground({ activeObject: { type: 'table', name: null }, record: null });
    expect(screen.getByTestId('pivot-playground-empty')).toBeInTheDocument();
  });

  test('drops land on ALL three shelves and mirror into the store draft', () => {
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('shelf-mock-rows-drop'));
    fireEvent.click(screen.getByTestId('shelf-mock-values-drop'));

    expect(screen.getByTestId('shelf-mock-columns-count')).toHaveTextContent('1');
    expect(screen.getByTestId('shelf-mock-rows-count')).toHaveTextContent('1');
    expect(screen.getByTestId('shelf-mock-values-count')).toHaveTextContent('1');

    const draft = useStore.getState().workspacePivotDraft;
    expect(draft.columns).toEqual(['${ref(sales-insight).revenue}']);
    expect(draft.rows).toEqual(['${ref(sales-insight).revenue}']);
    // A values drop lands as an aggregated chip (default agg).
    expect(draft.values).toEqual(['sum(${ref(sales-insight).revenue})']);
  });

  test('removing a chip empties its shelf and reports clean again', () => {
    const setDirty = jest.fn();
    renderPlayground({ record: { name: 'sales-pivot-table' }, setDirty });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    expect(setDirty).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('shelf-mock-columns-remove-first'));
    expect(screen.getByTestId('shelf-mock-columns-count')).toHaveTextContent('0');
    // Back to the saved (empty) config → clean.
    expect(setDirty).toHaveBeenLastCalledWith(false);
    expect(useStore.getState().workspacePivotDraft.columns).toEqual([]);
  });

  test('changing a value chip aggregation rewrites its serialized expression', () => {
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-values-drop'));
    expect(useStore.getState().workspacePivotDraft.values).toEqual([
      'sum(${ref(sales-insight).revenue})',
    ]);

    fireEvent.click(screen.getByTestId('shelf-mock-values-agg-avg'));
    expect(useStore.getState().workspacePivotDraft.values).toEqual([
      'avg(${ref(sales-insight).revenue})',
    ]);
  });

  test('cancelling the save modal keeps the dirty draft and never commits', () => {
    const saveTable = jest.fn(() => Promise.resolve({ success: true }));
    act(() => {
      useStore.setState({
        saveTable,
        tables: [{ name: 'sales-pivot-table', config: { name: 'sales-pivot-table' } }],
      });
    });
    renderPlayground({ record: { name: 'sales-pivot-table' } });

    fireEvent.click(screen.getByTestId('shelf-mock-columns-drop'));
    fireEvent.click(screen.getByTestId('pivot-playground-save'));
    expect(screen.getByTestId('pivot-save-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pivot-save-cancel'));
    expect(screen.queryByTestId('pivot-save-modal')).not.toBeInTheDocument();
    expect(saveTable).not.toHaveBeenCalled();
    // The draft is still dirty — Save stays enabled for another attempt.
    expect(screen.getByTestId('pivot-playground-save')).not.toBeDisabled();
  });
});
