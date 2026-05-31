/**
 * RightRailEditPanel tests (VIS-802 / Track G G-1).
 *
 * The selection-driven Edit-tab router. Verifies Q25 routing from
 * (workspaceActiveObject + workspaceOutlineSelectedKey) and the debounced
 * auto-save (no Save button) through saveDashboard.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

  test('item with a leaf ref (row.0.item.0 → chart) → that leaf object surface', () => {
    resetStore({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    renderPanel();
    // chart leaf → the "open in its own surface" affordance, chip = chart.
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveAttribute('data-object-type', 'chart');
    expect(chip).toHaveTextContent('rev_chart');
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

  test('project-chrome → deferred placeholder (M-3)', () => {
    resetStore({ workspaceActiveObject: { type: 'project', name: 'proj' } });
    renderPanel('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('right-rail-edit-project-placeholder')).toBeInTheDocument();
  });

  test('level → deferred placeholder (M-2b)', () => {
    resetStore({ workspaceActiveObject: { type: 'level', name: 'L0' } });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-level-placeholder')).toBeInTheDocument();
  });

  test('no selection → empty state', () => {
    resetStore({ workspaceActiveObject: null });
    renderPanel();
    expect(screen.getByTestId('right-rail-edit-empty')).toBeInTheDocument();
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

    // Change the row height select → schedules a debounced save.
    const heightSelect = screen.getByLabelText('Row 1 height');
    fireEvent.change(heightSelect, { target: { value: 'large' } });

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
});
