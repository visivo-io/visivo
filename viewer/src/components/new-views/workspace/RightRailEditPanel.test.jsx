/**
 * RightRailEditPanel tests (VIS-802 / Track G G-1).
 *
 * The selection-driven Edit-tab router. Verifies Q25 routing from
 * (workspaceActiveObject + workspaceOutlineSelectedKey) and the debounced
 * auto-save (no Save button) through saveDashboard.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
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
// The chart stub also exposes a button that flushes its config through the
// `onSave(type, name, config)` callback so we can assert the rail's standalone
// save routes through the unified `useRecordSave` backbone (VIS-1018 step 3).
jest.mock('../common/ChartEditForm', () => ({
  __esModule: true,
  default: ({ chart, onSave }) => (
    <div data-testid="chart-edit-form-stub">
      {`chart-edit-form-stub:${chart?.name || 'none'}`}
      <button
        type="button"
        data-testid="chart-stub-save"
        onClick={() => onSave?.('chart', chart?.name, { name: chart?.name, title: 'Edited' })}
      >
        save
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
    expect(config.title).toBe('Edited');

    // And the store collection was updated OPTIMISTICALLY before the round-trip.
    const entry = useStore.getState().charts.find(c => c.name === 'rev_chart');
    expect((entry.config || entry).title).toBe('Edited');
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
});
