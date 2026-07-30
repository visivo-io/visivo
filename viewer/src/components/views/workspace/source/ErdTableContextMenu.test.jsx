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
  let createExploration;
  let buildExplorationSeedState;
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    saveModel = jest.fn().mockResolvedValue({ success: true });
    openWorkspaceTab = jest.fn();
    createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_1' });
    buildExplorationSeedState = jest.fn().mockReturnValue({ modelTabs: ['query_1'] });
    state = {
      models: [{ name: 'orders_model' }], // forces the unique-name suffix
      saveModel,
      openWorkspaceTab,
      createExploration,
      buildExplorationSeedState,
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

  test('renders all three actions', () => {
    renderMenu();
    expect(screen.getByTestId('erd-table-ctx-create-model')).toBeInTheDocument();
    expect(screen.getByTestId('erd-table-ctx-explore-this')).toBeInTheDocument();
    expect(screen.getByTestId('erd-table-ctx-copy-name')).toBeInTheDocument();
  });

  // VIS-1067 — "Explore this" mints an exploration pre-wired with the same
  // SELECT * FROM <schema>.<table> + source, then opens its tab.
  describe('Explore this', () => {
    test('mints an exploration with the qualified name as seed provenance and the SELECT/source as build hints', async () => {
      renderMenu();
      fireEvent.click(screen.getByTestId('erd-table-ctx-explore-this'));

      await waitFor(() => expect(createExploration).toHaveBeenCalledTimes(1));
      expect(buildExplorationSeedState).toHaveBeenCalledWith(
        { type: 'table', name: 'public.orders' },
        { sql: 'SELECT * FROM public.orders', source: 'analytics_db' }
      );
      const [seed, returnTo, legacyStateOverride] = createExploration.mock.calls[0];
      expect(seed).toEqual({ type: 'table', name: 'public.orders' });
      expect(returnTo).toBeNull();
      expect(legacyStateOverride).toEqual({ modelTabs: ['query_1'] });

      await waitFor(() =>
        expect(openWorkspaceTab).toHaveBeenCalledWith({
          id: 'exploration:exp_1',
          type: 'exploration',
          name: 'exp_1',
        })
      );
    });

    test('does NOT open a tab when creation fails', async () => {
      createExploration.mockResolvedValue({ success: false, error: 'boom' });
      renderMenu();
      fireEvent.click(screen.getByTestId('erd-table-ctx-explore-this'));
      await waitFor(() => expect(createExploration).toHaveBeenCalled());
      expect(openWorkspaceTab).not.toHaveBeenCalled();
    });
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
