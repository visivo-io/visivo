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

// Each mocked shelf renders a button that fires its onDropField with the test
// field, plus a remove button when it has chips — enough to mutate the draft.
jest.mock('./PivotShelf', () => ({
  __esModule: true,
  AGGREGATIONS: ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'],
  default: ({ shelf, chips, onDropField }) => (
    <div data-testid={`shelf-mock-${shelf}`}>
      <span data-testid={`shelf-mock-${shelf}-count`}>{chips.length}</span>
      <button
        type="button"
        data-testid={`shelf-mock-${shelf}-drop`}
        onClick={() => onDropField({ name: 'revenue', source: 'sales-insight', label: 'Revenue' })}
      >
        drop
      </button>
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

  test('Save is disabled when clean and commits the draft when dirty', async () => {
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

    fireEvent.click(save);
    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    const [name, config] = saveTable.mock.calls[0];
    expect(name).toBe('sales-pivot-table');
    expect(config.columns).toEqual(['${ref(sales-insight).revenue}']);
  });

  test('renders the empty state when no table is selected', () => {
    renderPlayground({ activeObject: { type: 'table', name: null }, record: null });
    expect(screen.getByTestId('pivot-playground-empty')).toBeInTheDocument();
  });
});
