/**
 * RightRailEditPanel tests (VIS-802 / Track G G-1).
 *
 * The selection-driven Edit-tab router. Verifies Q25 routing from
 * (workspaceActiveObject + workspaceOutlineSelectedKey) and the debounced
 * auto-save (no Save button) through saveDashboard — now gated by the VIS-993
 * validation-as-save contract (invalid structure configs never persist).
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
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
import {
  preloadValidationSchema,
  validateRecordConfigSync,
  clearValidationCache,
} from './validateAgainstSchema';
// The real $defs validators compile heavyweight unions; under full-suite
// CPU contention the first compile can exceed jest's 5s default.
jest.setTimeout(30000);


// Render the REAL RefDropZone but capture each slot's `onChange` by id. The
// shell DndContext (G-1) performs a drop write by invoking exactly this
// callback, so tests call it to simulate a Library drop landing in a slot
// (jsdom cannot run a real dnd-kit pointer drag).
const mockRefDropZoneOnChange = {};
jest.mock('../common/RefDropZone', () => {
  const ReactActual = jest.requireActual('react');
  const ActualRefDropZone = jest.requireActual('../common/RefDropZone').default;
  const CapturingRefDropZone = props => {
    mockRefDropZoneOnChange[props.id] = props.onChange;
    return ReactActual.createElement(ActualRefDropZone, props);
  };
  return { __esModule: true, default: CapturingRefDropZone };
});

// Warm the bundled project schema so the VIS-993 gate takes its SYNC path in
// these tests — persistence decisions stay synchronous under fake timers,
// exactly like the production workspace after preload.
beforeAll(async () => {
  await preloadValidationSchema();
});

// Stub the heavy leaf forms so routing assertions stay focused.
jest.mock('../common/MarkdownEditForm', () => ({
  __esModule: true,
  // MarkdownEditForm self-persists via its own useRecordSave, then calls
  // onSave(config) only as a notification — model that single-arg convention.
  default: ({ markdown, onSave }) => (
    <div data-testid="markdown-edit-form-stub">
      md:{markdown?.name || 'none'}
      <button
        type="button"
        data-testid="markdown-edit-form-stub-self-save"
        onClick={() => onSave?.({ name: markdown?.name, content: 'Edited' })}
      >
        self-save
      </button>
    </div>
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
    <div data-testid={testid}>
      {`${testid}:${props?.[prop]?.name || 'none'}`}
      {/* relation/dimension/metric forms self-persist then call onSave(config)
          as a single-arg notification — model that convention so the rail's
          no-double-save guard is exercised (VIS-1018 review). */}
      <button
        type="button"
        data-testid={`${testid}-self-save`}
        onClick={() => props.onSave?.({ name: props?.[prop]?.name, edited: true })}
      >
        self-save
      </button>
    </div>
  ),
});
// The chart stub also exposes a button that flushes its config through the
// `onSave(type, name, config)` callback so we can assert the rail's standalone
// save routes through the unified `useRecordSave` backbone (VIS-1018 step 3).
jest.mock('../common/ChartEditForm', () => ({
  __esModule: true,
  default: ({ chart, onSave }) => (
    <div data-testid="chart-edit-form-stub">
      {`chart-edit-form-stub:${chart?.name || 'none'}`}
      {/* The config must be SCHEMA-VALID (Chart forbids unknown properties) or
          the VIS-993 validation gate blocks the save this test asserts. */}
      <button
        type="button"
        data-testid="chart-stub-save"
        onClick={() =>
          onSave?.('chart', chart?.name, {
            name: chart?.name,
            layout: { title: { text: 'Edited' } },
          })
        }
      >
        save
      </button>
      {/* VIS-993 §2: a config with a dangling ref — the gate must block it and
          the rail must surface the 'invalid' errors inline. (The ref context
          string is assembled so its ${...} form doesn't trip
          no-template-curly-in-string.) */}
      <button
        type="button"
        data-testid="chart-stub-save-invalid"
        onClick={() =>
          onSave?.('chart', chart?.name, {
            name: chart?.name,
            insights: [['$', '{ref(ghost_insight)}'].join('')],
          })
        }
      >
        save-invalid
      </button>
    </div>
  ),
}));
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
      // Local serve default (always editable) — the VIS-1025 read-only suite
      // overrides this with a cloud capability object.
      capabilities: null,
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

  test('VIS-993: a legacy empty-string scaffold config is BLOCKED from persisting (gate, not sanitize)', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    // A row whose item is the legacy invalid scaffold the old forms produced
    // ({ chart:'', table:'', markdown:'', input:'', selector:'' }). The
    // mutation module can no longer CREATE this shape; if it reaches the store
    // anyway, the validation gate must hold persistence — sanitize is retired,
    // nothing repairs the payload, and nothing invalid may POST.
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

    // Any edit (row height) routes the full config through the gate.
    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    // Nothing persisted; the rail surfaces the invalid status + the errors.
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(screen.getByTestId('right-rail-save-state')).toHaveAttribute('data-status', 'invalid');
    expect(screen.getByTestId('right-rail-validation-errors')).toBeInTheDocument();
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
    // VIS-993: rows are BORN with one empty slot (itemMutations.createRow) so
    // they stay visible drop targets (VIS-989) — no sanitize re-seeding.
    expect(config.rows[2]).toEqual({ height: 'medium', items: [{ width: 1 }] });
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

  test('dashboard view: "Add Item" appends a born-valid empty slot to that row', async () => {
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
    // VIS-993: the slot is BORN a bare { width } — never an empty-string
    // scaffold that needed sanitizing.
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

describe('RightRailEditPanel standalone leaf save (VIS-1018 step 3)', () => {
  test('a Library-row leaf save routes through the unified useRecordSave backbone', async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: { title: 'Old' } }],
      saveChart,
    });
    renderPanel();

    // The chart leaf form renders inline; trigger its onSave.
    expect(screen.getByTestId('chart-edit-form-stub')).toHaveTextContent('rev_chart');
    fireEvent.click(screen.getByTestId('chart-stub-save'));

    // Persisted via the chart store action (the same saveX action the retired
    // useObjectSave switch dispatched to), keyed by the open record name.
    await waitFor(() => expect(saveChart).toHaveBeenCalledTimes(1));
    const [name, config] = saveChart.mock.calls[0];
    expect(name).toBe('rev_chart');
    expect(config.layout.title.text).toBe('Edited');

    // And the store collection was updated OPTIMISTICALLY before the round-trip.
    const entry = useStore.getState().charts.find(c => c.name === 'rev_chart');
    expect((entry.config || entry).layout.title.text).toBe('Edited');
  });
});

// ── VIS-993 §3: structure configs born valid + the validation gate ──────────
describe('RightRailEditPanel structure validation gate (VIS-993)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  const lastSavedConfig = saveDashboard => {
    expect(saveDashboard).toHaveBeenCalled();
    return saveDashboard.mock.calls[saveDashboard.mock.calls.length - 1][1];
  };

  test('a leaf drop through the form persists exactly ONE leaf key (born valid, schema-verified)', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceOutlineSelectedKey: 'row.0',
      saveDashboard,
      tables: [{ name: 'sales_table', config: {} }],
    });
    renderPanel();

    // Slot 0 currently holds the rev_chart leaf. Dropping a TABLE on it must
    // clear the chart and write the single table ref — producing two leaf
    // types through the forms is impossible by construction.
    act(() => {
      mockRefDropZoneOnChange['row-0-item-0']({ type: 'table', name: 'sales_table' });
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const config = lastSavedConfig(saveDashboard);
    expect(config.rows[0].items[0]).toEqual({
      width: 1,
      table: formatRefExpression('sales_table'),
    });
    // Defense-in-depth agreement: the persisted config passes the same gate.
    expect(validateRecordConfigSync('dashboard', config)).toEqual(
      expect.objectContaining({ valid: true })
    );
  });

  test('clearing a leaf through the form persists a bare empty slot (no empty-string keys)', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    fireEvent.click(screen.getByTestId('pill-remove'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const config = lastSavedConfig(saveDashboard);
    // An empty-string leaf through the forms is impossible: cleared = GONE.
    expect(config.rows[0].items[0]).toEqual({ width: 1 });
    expect(validateRecordConfigSync('dashboard', config)).toEqual(
      expect.objectContaining({ valid: true })
    );
  });

  test('defense-in-depth: a config with TWO leaf types set is blocked by the gate', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    // Schema-valid but backend-invalid: the mutual exclusion is a Pydantic
    // model_validator, so the exclusivity half of the gate must catch it.
    const twoLeafDash = {
      name: 'simple-dashboard',
      config: {
        name: 'simple-dashboard',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                chart: formatRefExpression('rev_chart'),
                table: formatRefExpression('sales_table'),
              },
            ],
          },
        ],
      },
    };
    resetStore({
      workspaceOutlineSelectedKey: 'row.0',
      saveDashboard,
      dashboards: [twoLeafDash],
    });
    renderPanel();

    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(saveDashboard).not.toHaveBeenCalled();
    expect(screen.getByTestId('right-rail-save-state')).toHaveAttribute('data-status', 'invalid');
    expect(screen.getByTestId('right-rail-validation-errors')).toHaveTextContent(/only one of/i);
  });

  test('a subsequent VALID edit clears the invalid state and persists again', async () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    const scaffoldDash = {
      name: 'simple-dashboard',
      config: {
        name: 'simple-dashboard',
        rows: [{ height: 'medium', items: [{ width: 1, chart: '', table: '' }] }],
      },
    };
    resetStore({
      workspaceOutlineSelectedKey: 'row.0',
      saveDashboard,
      dashboards: [scaffoldDash],
    });
    renderPanel();

    // First edit: blocked (the stored item is invalid).
    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(screen.getByTestId('right-rail-save-state')).toHaveAttribute('data-status', 'invalid');

    // Dropping a real ref on the broken slot REPAIRS the config — the
    // born-valid mutation (applyLeafRef) strips the blank scaffold keys and
    // writes the single leaf → the gate opens and the save flows.
    act(() => {
      mockRefDropZoneOnChange['row-0-item-0']({ type: 'chart', name: 'rev_chart' });
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('right-rail-validation-errors')).not.toBeInTheDocument();
    const [, config] = saveDashboard.mock.calls[0];
    expect(config.rows[0].items[0]).toEqual({
      width: 1,
      chart: formatRefExpression('rev_chart'),
    });
  });

  test('async fallback: when the schema is not yet loaded the gate still persists a valid edit', async () => {
    // Drop the compiled validators — the sync path returns null and the gate
    // must defer to the async validateRecordConfig before persisting.
    clearValidationCache();
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({ workspaceOutlineSelectedKey: 'row.0', saveDashboard });
    renderPanel();

    selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
    // Flush the async validation (microtasks), then the debounce window.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [, config] = saveDashboard.mock.calls[0];
    expect(config.rows[0].height).toBe('large');
    // Restore the warm cache for any following test.
    await preloadValidationSchema();
  });
});

describe('RightRailEditPanel self-saving leaf forms do not double-persist (VIS-1018 review)', () => {
  // relation/dimension/metric/markdown forms persist via their own store action /
  // useRecordSave FIRST, then call onSave(config) purely as a notification. The
  // rail's handleObjectSave must NOT re-persist that single-arg call (which had
  // double-fired saveX before the fix).
  const cases = [
    ['relation', 'relations', 'saveRelation', 'relation-edit-form-stub-self-save'],
    ['dimension', 'dimensions', 'saveDimension', 'dimension-edit-form-stub-self-save'],
    ['metric', 'metrics', 'saveMetric', 'metric-edit-form-stub-self-save'],
    ['markdown', 'markdowns', 'saveMarkdown', 'markdown-edit-form-stub-self-save'],
  ];

  test.each(cases)(
    '%s: a single-arg onSave(config) notification does NOT re-fire %s through the rail',
    async (type, collectionKey, saveActionName, saveButtonTestId) => {
      const saveFn = jest.fn(() => Promise.resolve({ success: true }));
      resetStore({
        workspaceActiveObject: { type, name: 'obj1' },
        [collectionKey]: [{ name: 'obj1', config: { name: 'obj1' } }],
        [saveActionName]: saveFn,
      });
      renderPanel();

      fireEvent.click(screen.getByTestId(saveButtonTestId));

      // Let any erroneous async re-persist flush, then assert it never happened.
      await act(async () => {
        await Promise.resolve();
      });
      expect(saveFn).not.toHaveBeenCalled();
    }
  );
});

// ── Run-failure loop-back + invalid-status surfacing (VIS-993 §2 / VIS-981) ──
// When the run triggered by a just-saved record fails, the failure must land
// ON that record's editing surface — not only as a global indicator. And when
// the validation gate blocks a save ('invalid'), the rail renders the
// path: message error list inline (per-field mapping comes with VIS-996).
describe('RightRailEditPanel run-failure loop-back + invalid errors (VIS-993 §2)', () => {
  const FAILED_RUN_FOR = (dagFilter, over = {}) => ({
    id: 'run-9',
    state: 'failed',
    dag_filter: dagFilter,
    error_json: '{"message":"query exploded"}',
    is_superseded: false,
    created_at: '2026-07-01T12:00:00Z',
    ...over,
  });

  afterEach(() => {
    act(() => useStore.setState({ runs: [] }));
  });

  test('a failed run whose dag_filter includes the open record surfaces on its editing surface', () => {
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: {} }],
      runs: [FAILED_RUN_FOR('+rev_chart+,+orders_model+')],
    });
    renderPanel();
    const banner = screen.getByTestId('record-run-status');
    expect(banner).toHaveTextContent('Last run failed');
    expect(banner).toHaveTextContent('query exploded');
    // The edit form still renders — the banner sits with the save-status block.
    expect(screen.getByTestId('chart-edit-form-stub')).toBeInTheDocument();
  });

  test('a failure for a DIFFERENT record must NOT surface on the open record', () => {
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: {} }],
      runs: [FAILED_RUN_FOR('+other_chart+')],
    });
    renderPanel();
    expect(screen.queryByTestId('record-run-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-edit-form-stub')).toBeInTheDocument();
  });

  test('the banner clears when a newer succeeded run mentions the record', () => {
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: {} }],
      runs: [FAILED_RUN_FOR('+rev_chart+')],
    });
    renderPanel();
    expect(screen.getByTestId('record-run-status')).toBeInTheDocument();

    act(() =>
      useStore.setState({
        runs: [
          {
            id: 'run-10',
            state: 'succeeded',
            dag_filter: '+rev_chart+',
            error_json: null,
            is_superseded: false,
            created_at: '2026-07-01T13:00:00Z',
          },
          FAILED_RUN_FOR('+rev_chart+'),
        ],
      })
    );
    expect(screen.queryByTestId('record-run-status')).not.toBeInTheDocument();
  });

  test("an 'invalid' save (dangling ref) renders the rail-level path: message error list and blocks persistence", async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: {} }],
      saveChart,
      runs: [],
    });
    renderPanel();

    fireEvent.click(screen.getByTestId('chart-stub-save-invalid'));

    const errorList = await screen.findByTestId('record-save-errors');
    expect(errorList).toHaveTextContent('insights.0');
    expect(errorList).toHaveTextContent("ref 'ghost_insight' does not match any existing object");
    // The gate blocked the save — nothing persisted, no run fires.
    expect(saveChart).not.toHaveBeenCalled();
  });

  test('a VALID save renders no error list', async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: {} }],
      saveChart,
      runs: [],
    });
    renderPanel();

    fireEvent.click(screen.getByTestId('chart-stub-save'));
    await waitFor(() => expect(saveChart).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('record-save-errors')).not.toBeInTheDocument();
  });
});

// ── VIS-1025: the rail respects cloud read-only ─────────────────────────────
// capabilities (branchingStore): null = local serve (always editable); a cloud
// capability object with can_edit:false makes the stage read-only — the rail
// renders forms disabled behind a "Read-only — <edit_action>" notice and holds
// EVERY write (leaf saves via useRecordSave, structure writes via persistConfig).
describe('RightRailEditPanel cloud read-only (VIS-1025)', () => {
  const READONLY_CAPS = {
    can_view: true,
    can_edit: false,
    can_branch: true,
    is_default_stage: true,
    edit_action: 'Create a draft to edit',
  };

  afterEach(() => {
    act(() => useStore.setState({ capabilities: null }));
  });

  test('leaf form: renders the Read-only notice with the edit_action hint + a disabled fieldset', () => {
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: { title: 'Old' } }],
      capabilities: READONLY_CAPS,
    });
    renderPanel();

    const notice = screen.getByTestId('right-rail-readonly');
    expect(notice).toHaveTextContent('Read-only');
    expect(notice).toHaveTextContent('Create a draft to edit');
    // The form still renders (viewers can inspect the config)…
    expect(screen.getByTestId('chart-edit-form-stub')).toBeInTheDocument();
    // …but its fields sit inside a disabled fieldset (native controls disabled,
    // pointer events held for non-native editors).
    expect(screen.getByTestId('right-rail-readonly-fieldset')).toBeDisabled();
  });

  test('leaf form: an edit attempt produces ZERO optimistic store writes and ZERO saves', async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: { title: 'Old' } }],
      saveChart,
      capabilities: READONLY_CAPS,
    });
    renderPanel();

    // The stub's save button routes onSave('chart', name, config) → saveNow.
    fireEvent.click(screen.getByTestId('chart-stub-save'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(saveChart).not.toHaveBeenCalled();
    const entry = useStore.getState().charts.find(c => c.name === 'rev_chart');
    expect(entry.config).toEqual({ title: 'Old' });
    // And it never masquerades as a validation failure.
    expect(screen.queryByTestId('record-save-errors')).not.toBeInTheDocument();
  });

  test('structure form (persistConfig path): edits neither write optimistically nor persist', async () => {
    jest.useFakeTimers();
    try {
      const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
      resetStore({
        workspaceOutlineSelectedKey: 'row.0',
        saveDashboard,
        capabilities: READONLY_CAPS,
      });
      renderPanel();

      expect(screen.getByTestId('right-rail-readonly')).toBeInTheDocument();

      // Attempt a row-height edit through the live form.
      selectEvent.openMenu(screen.getByLabelText('Row 1 height'));
      fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'large'));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(saveDashboard).not.toHaveBeenCalled();
      // The store dashboard was NOT optimistically rewritten.
      const dash = useStore.getState().dashboards.find(d => d.name === 'simple-dashboard');
      expect(dash.config.rows[0].height).toBe('medium');
      // No 'invalid' churn either — the edit is not-allowed, not invalid.
      expect(screen.queryByTestId('right-rail-validation-errors')).not.toBeInTheDocument();
    } finally {
      act(() => jest.runOnlyPendingTimers());
      jest.useRealTimers();
    }
  });

  test('dashboard-chrome view: the notice renders and "Add row" is held', async () => {
    jest.useFakeTimers();
    try {
      const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
      resetStore({
        workspaceOutlineSelectedKey: 'dashboard',
        saveDashboard,
        capabilities: READONLY_CAPS,
      });
      renderPanel();

      expect(screen.getByTestId('right-rail-readonly')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('right-rail-edit-add-row'));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(saveDashboard).not.toHaveBeenCalled();
      const dash = useStore.getState().dashboards.find(d => d.name === 'simple-dashboard');
      expect(dash.config.rows).toHaveLength(2);
    } finally {
      act(() => jest.runOnlyPendingTimers());
      jest.useRealTimers();
    }
  });

  test('capabilities null (local serve) → no notice, no fieldset, saves flow — pin', async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: { title: 'Old' } }],
      saveChart,
      capabilities: null,
    });
    renderPanel();

    expect(screen.queryByTestId('right-rail-readonly')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-rail-readonly-fieldset')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chart-stub-save'));
    await waitFor(() => expect(saveChart).toHaveBeenCalledTimes(1));
  });

  test('cloud EDITABLE capabilities ({can_edit:true}) behave exactly like local serve — pin', async () => {
    const saveChart = jest.fn(() => Promise.resolve({ success: true }));
    resetStore({
      workspaceActiveObject: { type: 'chart', name: 'rev_chart' },
      charts: [{ name: 'rev_chart', config: { title: 'Old' } }],
      saveChart,
      capabilities: { ...READONLY_CAPS, can_edit: true, edit_action: null },
    });
    renderPanel();

    expect(screen.queryByTestId('right-rail-readonly')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chart-stub-save'));
    await waitFor(() => expect(saveChart).toHaveBeenCalledTimes(1));
  });
});
