/**
 * RightRailEditPanel tests (VIS-802 / Track G G-1).
 *
 * The selection-driven Edit-tab router. Verifies Q25 routing from
 * (workspaceActiveObject + workspaceOutlineSelectedKey) and the debounced
 * auto-save (no Save button) through saveDashboard.
 */
import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import RightRailEditPanel from './RightRailEditPanel';
import useStore from '../../../stores/store';
import { formatRefExpression } from '../../../utils/refString';

// Stub the heavy leaf forms so routing assertions stay focused.
jest.mock('../common/MarkdownEditForm', () => ({
  __esModule: true,
  default: ({ markdown }) => (
    <div data-testid="markdown-edit-form-stub">md:{markdown?.name || 'none'}</div>
  ),
}));
jest.mock('../common/InputEditForm', () => ({
  __esModule: true,
  default: ({ input }) => (
    <div data-testid="input-edit-form-stub">in:{input?.name || 'none'}</div>
  ),
}));
// The richer leaf / data-layer forms now render INLINE in the rail (VIS-802
// GAP-1/GAP-2). Stub them so routing assertions stay focused (and don't mount
// the heavy preview machinery). Each stub echoes the resolved record name.
const stubForm = (testid, prop) => ({
  __esModule: true,
  default: props => (
    <div data-testid={testid}>{`${testid}:${props?.[prop]?.name || 'none'}`}</div>
  ),
});
jest.mock('../common/ChartEditForm', () => stubForm('chart-edit-form-stub', 'chart'));
jest.mock('../common/TableEditForm', () => stubForm('table-edit-form-stub', 'table'));
jest.mock('../common/SourceEditForm', () => stubForm('source-edit-form-stub', 'source'));
jest.mock('../common/InsightEditForm', () => stubForm('insight-edit-form-stub', 'insight'));
jest.mock('../common/ModelEditForm', () => stubForm('model-edit-form-stub', 'model'));
jest.mock('../common/DimensionEditForm', () => stubForm('dimension-edit-form-stub', 'dimension'));
jest.mock('../common/MetricEditForm', () => stubForm('metric-edit-form-stub', 'metric'));
jest.mock('../common/RelationEditForm', () => stubForm('relation-edit-form-stub', 'relation'));
// VIS-807 (M-2b) + VIS-809 (M-3) — the level/defaults forms now render real
// forms (not placeholders). Stub them so routing assertions stay focused; each
// stub echoes the prop the router passes through (level index / defaults name).
jest.mock('../common/LevelEditForm', () => ({
  __esModule: true,
  default: ({ index }) => <div data-testid="level-edit-form-stub">{`level:${index}`}</div>,
}));
jest.mock('../common/DefaultsEditForm', () => ({
  __esModule: true,
  default: ({ name }) => <div data-testid="defaults-edit-form-stub">{`defaults:${name || 'none'}`}</div>,
}));

const SIMPLE_DASHBOARD = {
  name: 'simple-dashboard',
  config: {
    name: 'simple-dashboard',
    rows: [
      {
        height: 'medium',
        items: [{ width: 1, chart: formatRefExpression('rev_chart') }, { width: 1 }],
      },
      { height: 'small', items: [{ width: 1, markdown: formatRefExpression('notes') }] },
    ],
  },
};

const resetStore = (overrides = {}) => {
  act(() => {
    useStore.setState({
      workspaceActiveObject: { type: 'dashboard', name: 'simple-dashboard' },
      workspaceOutlineSelectedKey: 'dashboard',
      dashboards: [SIMPLE_DASHBOARD],
      charts: [{ name: 'rev_chart', config: {} }],
      tables: [],
      markdowns: [{ name: 'notes', config: { content: 'hi' } }],
      inputs: [],
      saveDashboard: jest.fn(() => Promise.resolve({ success: true })),
      openWorkspaceTab: jest.fn(),
      ...overrides,
    });
  });
};

const renderPanel = (entry = '/workspace/dashboard/simple-dashboard') => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <Route path="/workspace/dashboard/:dashboardName" element={<RightRailEditPanel />} />
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('RightRailEditPanel routing (VIS-802 / Q25)', () => {
  test('dashboard-chrome (Outline key "dashboard") → dashboard rows form + chip', () => {
    resetStore({ workspaceOutlineSelectedKey: 'dashboard' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-dashboard')).toBeInTheDocument();
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveAttribute('data-object-type', 'dashboard');
    expect(chip).toHaveTextContent('simple-dashboard');
    // The bundled rows render (RowEditForm per row).
    expect(screen.getByTestId('row-edit-form-0')).toBeInTheDocument();
    expect(screen.getByTestId('row-edit-form-1')).toBeInTheDocument();
  });

  test('row selection (Outline key "row.0") → single RowEditForm', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-row')).toBeInTheDocument();
    expect(screen.getByTestId('row-edit-form-0')).toBeInTheDocument();
    expect(screen.queryByTestId('row-edit-form-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('right-rail-selection-chip')).toHaveTextContent('Row 1');
  });

  test('item with a string-ref chart leaf (row.0.item.0) → inline ChartEditForm', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    renderPanel();
    // chart leaf → the inline chart edit form (GAP-2), chip = chart.
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveAttribute('data-object-type', 'chart');
    expect(chip).toHaveTextContent('rev_chart');
    expect(screen.getByTestId('right-rail-edit-leaf-form')).toBeInTheDocument();
    expect(screen.getByTestId('chart-edit-form-stub')).toHaveTextContent('rev_chart');
    // The old "open in its own surface" stub is gone for charts.
    expect(screen.queryByTestId('right-rail-edit-leaf-open')).not.toBeInTheDocument();
  });

  test('GAP-1: item with an OBJECT-stored chart leaf → inline ChartEditForm (not empty slot)', () => {
    // Real compiled dashboards carry the leaf as an object, not a ref string.
    const objectLeafDash = {
      name: 'simple-dashboard',
      config: {
        name: 'simple-dashboard',
        rows: [
          {
            height: 'medium',
            items: [{ width: 1, chart: { name: 'rev_chart', path: 'charts.rev_chart', insights: [] } }],
          },
        ],
      },
    };
    resetStore({
      workspaceOutlineSelectedKey: 'row.0.item.0',
      dashboards: [objectLeafDash],
    });
    renderPanel();
    // Must resolve to the chart leaf form — NOT mis-route as an empty ItemEditForm.
    expect(screen.getByTestId('chart-edit-form-stub')).toHaveTextContent('rev_chart');
    expect(screen.queryByTestId('right-rail-edit-item')).not.toBeInTheDocument();
  });

  test('item with a markdown leaf (row.1.item.0) → MarkdownEditForm', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.1.item.0' });
    renderPanel();
    expect(screen.getByTestId('markdown-edit-form-stub')).toHaveTextContent('notes');
  });

  test('empty item (row.0.item.1, no leaf ref) → ItemEditForm', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-item')).toBeInTheDocument();
    expect(screen.getByTestId('item-edit-form-row-0-item-1')).toBeInTheDocument();
  });

  test('Library-row markdown object → MarkdownEditForm', () => {
    resetStore({
      workspaceActiveObject: { type: 'markdown', name: 'notes' },
    });
    renderPanel();
    expect(screen.getByTestId('markdown-edit-form-stub')).toHaveTextContent('notes');
  });

  test('project-chrome → DefaultsEditForm (VIS-809 / M-3)', () => {
    resetStore({ workspaceActiveObject: { type: 'project', name: 'proj' } });
    renderPanel('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('defaults-edit-form-stub')).toHaveTextContent('defaults:proj');
    expect(screen.queryByTestId('right-rail-edit-project-placeholder')).not.toBeInTheDocument();
  });

  test('defaults selection → DefaultsEditForm (VIS-809 / M-3)', () => {
    resetStore({ workspaceActiveObject: { type: 'defaults', name: 'settings' } });
    renderPanel('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('defaults-edit-form-stub')).toHaveTextContent('defaults:settings');
  });

  test('level → LevelEditForm at the selected index (VIS-807 / M-2b)', () => {
    resetStore({ workspaceActiveObject: { type: 'level', name: 'Team', index: 2 } });
    renderPanel();
    expect(screen.getByTestId('level-edit-form-stub')).toHaveTextContent('level:2');
    expect(screen.queryByTestId('right-rail-edit-level-placeholder')).not.toBeInTheDocument();
  });

  test('level with no index → LevelEditForm defaulting to index 0', () => {
    resetStore({ workspaceActiveObject: { type: 'level', name: 'L0' } });
    renderPanel();
    expect(screen.getByTestId('level-edit-form-stub')).toHaveTextContent('level:0');
  });

  test('no selection → empty state', () => {
    resetStore({ workspaceActiveObject: null });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-empty')).toBeInTheDocument();
  });
});

// Nested container keys (row.N.item.M.row.P[.item.Q]) come from
// OutlineTreePanel + breadcrumbNav; the router must resolve them at ANY depth
// instead of falling through to the whole-dashboard form.
const NESTED_DASHBOARD = {
  name: 'simple-dashboard',
  config: {
    name: 'simple-dashboard',
    rows: [
      {
        height: 'medium',
        items: [
          { width: 1, chart: formatRefExpression('rev_chart') },
          {
            width: 1,
            rows: [
              {
                height: 'small',
                items: [
                  { width: 1, chart: formatRefExpression('nested_chart') },
                  { width: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('RightRailEditPanel nested container keys (arbitrary depth)', () => {
  const resetNested = overrides =>
    resetStore({
      dashboards: [NESTED_DASHBOARD],
      charts: [
        { name: 'rev_chart', config: {} },
        { name: 'nested_chart', config: {} },
      ],
      ...overrides,
    });

  test('nested row key (row.0.item.1.row.0) → that row form, NOT the whole-dashboard form', () => {
    resetNested({ workspaceOutlineSelectedKey: 'row.0.item.1.row.0' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-row')).toBeInTheDocument();
    expect(screen.queryByTestId('right-rail-edit-dashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('right-rail-selection-chip')).toHaveTextContent('Row 1');
  });

  test('nested chart item key (row.0.item.1.row.0.item.0) → the leaf chart form', () => {
    resetNested({ workspaceOutlineSelectedKey: 'row.0.item.1.row.0.item.0' });
    renderPanel();
    expect(screen.getByTestId('chart-edit-form-stub')).toHaveTextContent('nested_chart');
    expect(screen.queryByTestId('right-rail-edit-dashboard')).not.toBeInTheDocument();
  });

  test('nested EMPTY item key (row.0.item.1.row.0.item.1) → ItemEditForm for that slot', () => {
    resetNested({ workspaceOutlineSelectedKey: 'row.0.item.1.row.0.item.1' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-item')).toBeInTheDocument();
    expect(screen.queryByTestId('right-rail-edit-dashboard')).not.toBeInTheDocument();
  });

  test('a nested key pointing past the live config → not-found placeholder (not the dashboard form)', () => {
    resetNested({ workspaceOutlineSelectedKey: 'row.0.item.1.row.5' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-missing')).toBeInTheDocument();
  });
});

describe('RightRailEditPanel auto-save (VIS-802)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('row height change auto-saves through saveDashboard after the debounce (no Save button)', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    // There is no Save button in the structure form.
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();

    // Change the row height select → schedules a debounced save. The brand
    // <Select> menu portals to document.body; open it + click synchronously
    // (fake timers are active, so react-select-event's async select can't run).
    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));

    // Pending immediately, save fires only after the debounce window.
    expect(saveDashboard).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [name, config] = saveDashboard.mock.calls[0];
    expect(name).toBe('simple-dashboard');
    expect(config.rows[0].height).toBe('large');
  });

  test('GAP-3: auto-save sanitizes empty-string scaffold items so the payload is backend-valid', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    // A row whose item is the invalid scaffold the forms produce
    // ({ chart:'', table:'', markdown:'', input:'', selector:'' }). The backend
    // counts every empty string as "set" and 400s; the persisted payload must
    // be sanitized to a clean empty slot before it leaves the client.
    const scaffoldDash = {
      name: 'simple-dashboard',
      config: {
        name: 'simple-dashboard',
        rows: [
          {
            height: 'medium',
            items: [{ width: 1, chart: '', table: '', markdown: '', input: '', selector: '' }],
          },
        ],
      },
    };
    resetStore({
      workspaceOutlineSelectedKey: 'row.0',
      saveDashboard,
      dashboards: [scaffoldDash],
    });
    renderPanel();

    // Any edit (row height) triggers a save of the full config.
    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [, config] = saveDashboard.mock.calls[0];
    const item = config.rows[0].items[0];
    // Empty leaf fields + the non-model `selector` key are stripped → exactly
    // zero leaf types set (a valid empty slot), so no >1 / extra-field 400.
    expect(item).toEqual({ width: 1 });
    ['chart', 'table', 'markdown', 'input', 'selector'].forEach(k =>
      expect(k in item).toBe(false)
    );
  });

  test('editing a NESTED container row writes the change at its nested path', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceOutlineSelectedKey: 'row.0.item.1.row.0',
      saveDashboard,
      dashboards: [NESTED_DASHBOARD],
      charts: [
        { name: 'rev_chart', config: {} },
        { name: 'nested_chart', config: {} },
      ],
    });
    renderPanel();

    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [, config] = saveDashboard.mock.calls[0];
    // The NESTED row changed…
    expect(config.rows[0].items[1].rows[0].height).toBe('large');
    // …and the outer structure is untouched.
    expect(config.rows[0].height).toBe('medium');
    expect(config.rows).toHaveLength(1);
  });
});

// ── Library-row / leaf routing for the remaining data-layer types ────────────
describe('RightRailEditPanel Library-row routing (GAP-1/GAP-2 inline forms)', () => {
  const CASES = [
    ['table', 'tables', 'table-edit-form-stub', 'orders_table'],
    ['source', 'sources', 'source-edit-form-stub', 'pg_local'],
    ['insight', 'insights', 'insight-edit-form-stub', 'rev_insight'],
    ['model', 'models', 'model-edit-form-stub', 'orders_model'],
    ['dimension', 'dimensions', 'dimension-edit-form-stub', 'region_dim'],
    ['metric', 'metrics', 'metric-edit-form-stub', 'arr_metric'],
    ['relation', 'relations', 'relation-edit-form-stub', 'orders_to_users'],
    ['input', 'inputs', 'input-edit-form-stub', 'date_input'],
  ];

  test.each(CASES)(
    'a %s Library row renders its inline edit form with the resolved record',
    (type, collectionKey, stubId, name) => {
      resetStore({
        workspaceActiveObject: { type, name },
        [collectionKey]: [{ name, config: {} }],
      });
      renderPanel();
      expect(screen.getByTestId('right-rail-edit-leaf-form')).toBeInTheDocument();
      expect(screen.getByTestId(stubId)).toHaveTextContent(name);
      const chip = screen.getByTestId('right-rail-selection-chip');
      expect(chip).toHaveAttribute('data-object-type', type);
      expect(chip).toHaveTextContent(name);
    }
  );

  test('a compound type without an in-rail form (csvScriptModel) offers "Open" instead', () => {
    const openWorkspaceTab = jest.fn();
    resetStore({
      workspaceActiveObject: { type: 'csvScriptModel', name: 'seed_csv' },
      csvScriptModels: [{ name: 'seed_csv', config: {} }],
      openWorkspaceTab,
    });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-leaf-open')).toBeInTheDocument();
    expect(screen.queryByTestId('right-rail-edit-leaf-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(openWorkspaceTab).toHaveBeenCalledWith({ type: 'csvScriptModel', name: 'seed_csv' });
  });

  test('an unsupported selection type falls through to the "no editor yet" state', () => {
    resetStore({ workspaceActiveObject: { type: 'selector', name: 'sel1' } });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-unsupported')).toBeInTheDocument();
    expect(screen.getByTestId('right-rail-selection-chip')).toHaveTextContent('sel1');
  });

  test('a stale item key past the live config → item-not-found placeholder', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0.item.9' });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-missing')).toBeInTheDocument();
    expect(screen.getByTestId('right-rail-edit-missing')).toHaveTextContent('Item not found');
  });

  test('a dashboard record WITHOUT a nested config still routes (record is the config)', () => {
    // Some store entries carry the config fields at the top level.
    resetStore({
      workspaceOutlineSelectedKey: 'dashboard',
      dashboards: [
        {
          name: 'simple-dashboard',
          rows: [{ height: 'large', items: [{ width: 1 }] }],
        },
      ],
    });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('row-edit-form-0')).toBeInTheDocument();
    expect(screen.getByTestId('right-rail-selection-chip')).toHaveTextContent('1 row');
  });
});

// ── Structural edits through the auto-saved dashboard / row / item forms ─────
describe('RightRailEditPanel structural edits (VIS-802 auto-save)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  const lastSavedConfig = saveDashboard => {
    expect(saveDashboard).toHaveBeenCalled();
    return saveDashboard.mock.calls[saveDashboard.mock.calls.length - 1][1];
  };

  test('dashboard view: "Add row" appends an empty row', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'dashboard', saveDashboard });
    renderPanel();

    fireEvent.click(screen.getByTestId('right-rail-edit-add-row'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    const config = lastSavedConfig(saveDashboard);
    expect(config.rows).toHaveLength(3);
    // Sanitize re-seeds an empty row with ONE empty slot so it stays a visible
    // drop target (VIS-989) and satisfies the backend's non-empty-items rule.
    expect(config.rows[2]).toEqual({ height: 'medium', items: [{}] });
  });

  test('dashboard view: removing a row drops exactly that row', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'dashboard', saveDashboard });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    const config = lastSavedConfig(saveDashboard);
    expect(config.rows).toHaveLength(1);
    expect(config.rows[0].height).toBe('small');
  });

  test('dashboard view: "Add Item" appends a sanitized empty slot to that row', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'dashboard', saveDashboard });
    renderPanel();

    const row0 = screen.getByTestId('row-edit-form-0');
    fireEvent.click(within(row0).getByRole('button', { name: /add item/i }));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    const config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items).toHaveLength(3);
    // GAP-3: the empty-string scaffold is sanitized to a clean empty slot.
    expect(config.rows[0].items[2]).toEqual({ width: 1 });
  });

  test('dashboard view: removing an item + changing an item width both persist', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'dashboard', saveDashboard });
    renderPanel();

    const row0 = screen.getByTestId('row-edit-form-0');
    // Remove the second (empty) item of row 0.
    fireEvent.click(within(row0).getByRole('button', { name: 'Remove item 2' }));
    // Then widen the remaining chart item.
    fireEvent.change(within(row0).getByRole('spinbutton', { name: 'Item 1 width' }), {
      target: { value: '5' },
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    const config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items).toHaveLength(1);
    expect(String(config.rows[0].items[0].width)).toBe('5');
  });

  test('row view: remove-row / add-item / width edits write through the nested-path helper', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    const rowForm = screen.getByTestId('row-edit-form-0');
    fireEvent.click(within(rowForm).getByRole('button', { name: /add item/i }));
    fireEvent.change(within(rowForm).getByRole('spinbutton', { name: 'Item 1 width' }), {
      target: { value: '4' },
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    let config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items).toHaveLength(3);
    expect(String(config.rows[0].items[0].width)).toBe('4');
    // The sibling row is untouched.
    expect(config.rows[1].items).toHaveLength(1);

    // Removing an item from THIS row only.
    fireEvent.click(within(rowForm).getByRole('button', { name: 'Remove item 3' }));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items).toHaveLength(2);

    // Removing the row itself drops it from the dashboard.
    fireEvent.click(within(rowForm).getByRole('button', { name: 'Remove row 1' }));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    config = lastSavedConfig(saveDashboard);
    expect(config.rows).toHaveLength(1);
    expect(config.rows[0].height).toBe('small');
  });

  test('item view: editing the slot width writes through updateItem; removing empties the slot', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0.item.1', saveDashboard });
    renderPanel();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Item 2 width' }), {
      target: { value: '7' },
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    let config = lastSavedConfig(saveDashboard);
    expect(String(config.rows[0].items[1].width)).toBe('7');

    // Removing the item drops the slot; the selection now points at nothing and
    // the panel degrades to the not-found placeholder (optimistic update).
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(screen.getByTestId('right-rail-edit-missing')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items).toHaveLength(1);
  });

  test('clicking a filled slot pill opens that object as a workspace tab', () => {
    const openWorkspaceTab = jest.fn();
    resetStore({ workspaceOutlineSelectedKey: 'row.0', openWorkspaceTab });
    renderPanel();

    const dropzone = screen.getByTestId('ref-dropzone-row-0-item-0');
    fireEvent.click(within(dropzone).getByTitle('chart: rev_chart — click to open'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({ type: 'chart', name: 'rev_chart' });
  });
});

// ── Breadcrumb keyboard nav wired to the live config (G-2) ──────────────────
describe('RightRailEditPanel breadcrumb keyboard nav (VIS-804)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('⌘↓ on a row reorders it within the dashboard and re-keys the selection', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), {
      key: 'ArrowDown',
      metaKey: true,
    });

    // The selection follows the moved row to its new index…
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.1');
    // …and the reordered config persists through the debounced save.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [, config] = saveDashboard.mock.calls[0];
    expect(config.rows.map(r => r.height)).toEqual(['small', 'medium']);
  });

  test('⌘↑ at the top edge is a no-op (no save scheduled)', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), {
      key: 'ArrowUp',
      metaKey: true,
    });
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.0');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(saveDashboard).not.toHaveBeenCalled();
  });

  test('Enter on the breadcrumb moves focus into the Edit form fields', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0' });
    renderPanel();

    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'Enter' });
    // The form's first focusable field is the row-height combobox input.
    expect(screen.getByLabelText('Row 1 height')).toHaveFocus();
  });
});
