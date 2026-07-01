/**
 * ErdTableContextMenu — right-click "Create a model to query this table" (VIS-1005).
 *
 * The create-model action must build `SELECT * FROM <schema>.<table>`, mint a
 * unique model name, save a SqlModel with `source: ${ref(<sourceName>)}` via the
 * model store, then open it as a workspace tab. The store is mocked.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErdTableContextMenu, { buildSelectStar, buildQualifiedName } from './ErdTableContextMenu';
import useStore from '../../../../stores/store';

jest.mock('../../../../stores/store');

describe('buildSelectStar / buildQualifiedName', () => {
  test('schema.table → SELECT * FROM schema.table (no quoting for plain idents)', () => {
    expect(buildSelectStar({ schema: 'public', table: 'orders' })).toBe(
      'SELECT * FROM public.orders'
    );
    expect(buildQualifiedName({ schema: 'public', table: 'orders' })).toBe('public.orders');
  });

  test('omits a null/empty schema (schemaless databases)', () => {
    expect(buildSelectStar({ schema: null, table: 'orders' })).toBe('SELECT * FROM orders');
    expect(buildQualifiedName({ schema: '', table: 'orders' })).toBe('orders');
  });

  test('quotes non-identifier names with embedded quotes doubled', () => {
    expect(buildSelectStar({ schema: 'my schema', table: 'weird"name' })).toBe(
      'SELECT * FROM "my schema"."weird""name"'
    );
  });
});

describe('ErdTableContextMenu', () => {
  let saveModel;
  let openWorkspaceTab;
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    saveModel = jest.fn().mockResolvedValue({ success: true });
    openWorkspaceTab = jest.fn();
    state = {
      models: [{ name: 'orders_model' }], // forces the unique-name suffix
      saveModel,
      openWorkspaceTab,
    };
    useStore.mockImplementation(selector =>
      typeof selector === 'function' ? selector(state) : state
    );
  });

  const renderMenu = (target = { schema: 'public', table: 'orders' }) =>
    render(
      <ErdTableContextMenu
        x={10}
        y={10}
        sourceName="analytics_db"
        target={target}
        onDismiss={jest.fn()}
      />
    );

  test('renders both actions', () => {
    renderMenu();
    expect(screen.getByTestId('erd-table-ctx-create-model')).toBeInTheDocument();
    expect(screen.getByTestId('erd-table-ctx-copy-name')).toBeInTheDocument();
  });

  test('create-model builds the SELECT, saves with a ref() source, and opens a tab', async () => {
    renderMenu();

    fireEvent.click(screen.getByTestId('erd-table-ctx-create-model'));

    await waitFor(() => expect(saveModel).toHaveBeenCalledTimes(1));

    const [name, config] = saveModel.mock.calls[0];
    // 'orders_model' is taken → unique name gets the _2 suffix.
    expect(name).toBe('orders_model_2');
    expect(config).toMatchObject({
      name: 'orders_model_2',
      sql: 'SELECT * FROM public.orders',
      // The source is wrapped as a context-string ref expression.
      source: ['$', '{ref(analytics_db)}'].join(''),
    });

    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'model:orders_model_2',
        type: 'model',
        name: 'orders_model_2',
      })
    );
  });

  test('does NOT open a tab when the save fails', async () => {
    saveModel.mockResolvedValue({ success: false, error: 'boom' });
    renderMenu();

    fireEvent.click(screen.getByTestId('erd-table-ctx-create-model'));

    await waitFor(() => expect(saveModel).toHaveBeenCalled());
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('copy qualified name writes to the clipboard', () => {
    const writeText = jest.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    renderMenu({ schema: 'public', table: 'orders' });

    fireEvent.click(screen.getByTestId('erd-table-ctx-copy-name'));
    expect(writeText).toHaveBeenCalledWith('public.orders');
  });
});
