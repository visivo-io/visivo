/**
 * ProjectCanvas (VIS-D1 / VIS-767, extended by VIS-D2 / VIS-768).
 *
 * Verifies ProjectCanvas wraps <Dashboard> at parity (forwards `projectId` /
 * `dashboardName` unchanged) AND mounts the VIS-768 editing-affordance overlay
 * layer on top. Dashboard is mocked so this stays a focused wrapper test,
 * not the heavy Plotly/data tree; the overlay reads the real workspace store.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectCanvas from './ProjectCanvas';
import useStore from '../../../../stores/store';
import { WorkspaceCommitProvider } from '../../workspace/WorkspaceDndContext';
import { setWorkspaceTelemetryListener } from '../../workspace/telemetry';

// ProjectCanvas mounts the CanvasAddRow overlay, which uses react-router's
// useNavigate for the inline-create route (VIS-794), so renders are wrapped in
// a router.
const renderWithRouter = ui =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  );

// When set, the Dashboard mock invokes the canvas's `renderBrokenRef` render
// prop with these args — exactly what the real renderer does for a leaf whose
// ref doesn't resolve (VIS-792 / L-1).
let mockBrokenRefArgs = null;
// When set, the Dashboard mock renders a stand-in empty slot whose click calls
// the canvas's `onEmptySlotClick` with this itemPath — exactly what the real
// renderer's empty-slot button does (W5 click-to-pick).
let mockEmptySlotPath = null;

jest.mock('../../../project/Dashboard', () => {
  const Mock = ({ projectId, dashboardName, renderBrokenRef, onEmptySlotClick }) => (
    <div
      data-testid="dashboard-new-mock"
      data-project-id={projectId}
      data-dashboard-name={dashboardName}
    >
      {mockBrokenRefArgs && typeof renderBrokenRef === 'function'
        ? renderBrokenRef(mockBrokenRefArgs)
        : null}
      {mockEmptySlotPath && typeof onEmptySlotClick === 'function' ? (
        <button
          data-testid="mock-empty-slot"
          onClick={() => onEmptySlotClick({ itemPath: mockEmptySlotPath })}
        />
      ) : null}
    </div>
  );
  Mock.displayName = 'MockDashboard';
  return { __esModule: true, default: Mock };
});

// The card's own UI (picker, confirm) is covered by BrokenRefCard.test; here we
// mock it to drive ProjectCanvas's fix / delete / create-new WIRING directly.
jest.mock('./BrokenRefCard', () => {
  const MockCard = ({ type, name, onFix, onDelete, onCreateNew }) => (
    <div data-testid="broken-ref-card" data-broken-type={type} data-broken-name={name}>
      <button data-testid="mock-fix" onClick={() => onFix('chart', 'rescue-chart')} />
      <button data-testid="mock-fix-invalid" onClick={() => onFix('bogus', 'x')} />
      <button data-testid="mock-delete" onClick={() => onDelete()} />
      <button data-testid="mock-create-chart" onClick={() => onCreateNew('chart')} />
      <button data-testid="mock-create-table" onClick={() => onCreateNew('table')} />
      <button data-testid="mock-create-markdown" onClick={() => onCreateNew('markdown')} />
      <button data-testid="mock-create-input" onClick={() => onCreateNew('input')} />
      <button data-testid="mock-create-unknown" onClick={() => onCreateNew('mystery')} />
    </div>
  );
  return { __esModule: true, default: MockCard };
});

describe('ProjectCanvas (VIS-767 / VIS-768)', () => {
  test('renders Dashboard', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-new-mock')).toBeInTheDocument();
  });

  test('forwards projectId and dashboardName to Dashboard unchanged', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-42" dashboardName="revenue" />);
    const dashboard = screen.getByTestId('dashboard-new-mock');
    expect(dashboard).toHaveAttribute('data-project-id', 'proj-42');
    expect(dashboard).toHaveAttribute('data-dashboard-name', 'revenue');
  });

  test('mounts the editing-affordance overlay layer (VIS-768)', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    // The overlay is a pointer-events-none sibling layer positioned over the
    // render — it must NOT intercept Dashboard's own interactivity.
    const overlay = screen.getByTestId('canvas-overlay-layer');
    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toContain('pointer-events-none');
  });

  test('the canvas root is positioned so the overlay can anchor to it', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas').className).toContain('relative');
  });

  test('mounts the DnD affordance layer when the scoped dashboard exists (VIS-771)', () => {
    useStore.setState({
      dashboards: [{ name: 'sales', config: { rows: [{ items: [{ chart: 'ref(a)' }] }] } }],
    });
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    // The DnD layer is wired to the shell's shared DndContext (no second
    // context); it mounts as a pointer-events-none sibling over the render.
    const dndLayer = screen.getByTestId('canvas-dnd-layer');
    expect(dndLayer).toBeInTheDocument();
    expect(dndLayer.className).toContain('pointer-events-none');
  });
});

describe('ProjectCanvas — broken-ref repair wiring (VIS-792 / L-1)', () => {
  const SALES = {
    name: 'sales',
    config: {
      rows: [
        {
          height: 'medium',
          items: [
            { width: 6, chart: 'ref(ghost)' },
            { width: 6, table: 'ref(t)' },
          ],
        },
      ],
    },
  };

  let commit;
  let events;

  const renderCanvas = (dashboardName = 'sales') =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceCommitProvider value={commit}>
          <ProjectCanvas projectId="proj-1" dashboardName={dashboardName} />
        </WorkspaceCommitProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    commit = jest.fn();
    events = [];
    setWorkspaceTelemetryListener(e => events.push(e));
    mockBrokenRefArgs = { type: 'chart', name: 'ghost', itemPath: 'row.0.item.0' };
    useStore.setState({
      dashboards: [SALES],
      openCreateChartModal: jest.fn(),
      openCreateTableModal: jest.fn(),
      openCreateMarkdownModal: jest.fn(),
      openCreateInputModal: jest.fn(),
    });
  });

  afterEach(() => {
    mockBrokenRefArgs = null;
    setWorkspaceTelemetryListener(null);
  });

  test('mounts the broken-ref card with the unresolved type + name', () => {
    renderCanvas();
    const card = screen.getByTestId('broken-ref-card');
    expect(card).toHaveAttribute('data-broken-type', 'chart');
    expect(card).toHaveAttribute('data-broken-name', 'ghost');
  });

  test('Fix re-points the slot and commits through the shared canvas path', () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-fix'));
    expect(commit).toHaveBeenCalledTimes(1);
    const [name, nextConfig, meta] = commit.mock.calls[0];
    expect(name).toBe('sales');
    expect(meta).toEqual({ kind: 'broken_ref_fix' });
    // The slot now carries exactly one leaf ref, re-pointed to the pick.
    expect(nextConfig.rows[0].items[0]).toEqual({ width: 6, chart: 'ref(rescue-chart)' });
    // Sibling slot untouched.
    expect(nextConfig.rows[0].items[1]).toEqual({ width: 6, table: 'ref(t)' });

    const evt = events.find(e => e.eventName === 'canvas_action');
    expect(evt).toBeTruthy();
    expect(evt.payload).toMatchObject({
      kind: 'broken_ref_fix',
      dashboardName: 'sales',
      path: 'row.0.item.0',
      type: 'chart',
      name: 'rescue-chart',
    });
  });

  test('a fix that produces no config change commits nothing', () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-fix-invalid'));
    expect(commit).not.toHaveBeenCalled();
    expect(events.find(e => e.eventName === 'canvas_action')).toBeUndefined();
  });

  test('Delete removes the slot and commits through the shared canvas path', () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-delete'));
    expect(commit).toHaveBeenCalledTimes(1);
    const [name, nextConfig, meta] = commit.mock.calls[0];
    expect(name).toBe('sales');
    expect(meta).toEqual({ kind: 'broken_ref_delete' });
    expect(nextConfig.rows[0].items).toEqual([{ width: 6, table: 'ref(t)' }]);

    const evt = events.find(e => e.eventName === 'canvas_action');
    expect(evt.payload).toMatchObject({
      kind: 'broken_ref_delete',
      dashboardName: 'sales',
      path: 'row.0.item.0',
    });
  });

  test('deleting an out-of-range slot commits nothing (config unchanged)', () => {
    mockBrokenRefArgs = { type: 'chart', name: 'ghost', itemPath: 'row.9.item.9' };
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-delete'));
    expect(commit).not.toHaveBeenCalled();
  });

  test('fix + delete are inert when the scoped dashboard is missing', () => {
    renderCanvas('missing');
    fireEvent.click(screen.getByTestId('mock-fix'));
    fireEvent.click(screen.getByTestId('mock-delete'));
    expect(commit).not.toHaveBeenCalled();
  });

  test.each([
    ['chart', 'openCreateChartModal'],
    ['table', 'openCreateTableModal'],
    ['markdown', 'openCreateMarkdownModal'],
    ['input', 'openCreateInputModal'],
  ])('Create-new %s routes to its create modal + fires inline_create_used', (kind, storeFn) => {
    renderCanvas();
    fireEvent.click(screen.getByTestId(`mock-create-${kind}`));
    expect(useStore.getState()[storeFn]).toHaveBeenCalledTimes(1);
    const evt = events.find(e => e.eventName === 'inline_create_used');
    expect(evt.payload).toEqual({ source: 'broken_ref', kind });
  });

  test('Create-new with an unknown type opens no modal (still telemeters the intent)', () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-create-unknown'));
    ['openCreateChartModal', 'openCreateTableModal', 'openCreateMarkdownModal', 'openCreateInputModal'].forEach(
      fn => expect(useStore.getState()[fn]).not.toHaveBeenCalled()
    );
    expect(events.find(e => e.eventName === 'inline_create_used')?.payload).toEqual({
      source: 'broken_ref',
      kind: 'mystery',
    });
  });

  test('Create-new tolerates a store without the create-modal actions', () => {
    useStore.setState({ openCreateChartModal: undefined });
    renderCanvas();
    fireEvent.click(screen.getByTestId('mock-create-chart'));
    // No crash; the intent is still recorded.
    expect(events.find(e => e.eventName === 'inline_create_used')).toBeTruthy();
  });
});

describe('ProjectCanvas — empty-slot click-to-pick (W5 / Track L)', () => {
  // A dashboard whose row.0 carries a genuinely EMPTY third slot.
  const SALES_WITH_EMPTY = {
    name: 'sales',
    config: {
      rows: [
        {
          height: 'medium',
          items: [
            { width: 6, chart: 'ref(existing-chart)' },
            { width: 5, table: 'ref(t)' },
            { width: 1 }, // empty slot
          ],
        },
      ],
    },
  };

  let commit;
  let events;

  const renderCanvas = (dashboardName = 'sales') =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceCommitProvider value={commit}>
          <ProjectCanvas projectId="proj-1" dashboardName={dashboardName} />
        </WorkspaceCommitProvider>
      </MemoryRouter>
    );

  const openPicker = () => {
    fireEvent.click(screen.getByTestId('mock-empty-slot'));
    return screen.getByTestId('reference-picker');
  };

  beforeEach(() => {
    commit = jest.fn();
    events = [];
    setWorkspaceTelemetryListener(e => events.push(e));
    mockEmptySlotPath = 'row.0.item.2';
    useStore.setState({
      dashboards: [SALES_WITH_EMPTY],
      charts: [{ name: 'existing-chart' }],
      tables: [],
      markdowns: [],
      inputs: [],
      insights: [{ name: 'rev-insight' }],
      saveChart: jest.fn().mockResolvedValue({ success: true }),
      openCreateChartModal: jest.fn(),
    });
  });

  afterEach(() => {
    mockEmptySlotPath = null;
    setWorkspaceTelemetryListener(null);
  });

  test('clicking an empty slot opens the ReferencePicker listing charts AND insights', () => {
    renderCanvas();
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();
    openPicker();
    expect(screen.getByTestId('reference-picker-title')).toHaveTextContent(
      'Pick a chart or insight'
    );
    expect(screen.getByTestId('reference-picker-section-chart')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-section-insight')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-existing-chart')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-rev-insight')).toBeInTheDocument();
  });

  test('picking a CHART places chart: ref(name) into the slot via the working copy', () => {
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-row-existing-chart'));

    expect(commit).toHaveBeenCalledTimes(1);
    const [name, nextConfig, meta] = commit.mock.calls[0];
    expect(name).toBe('sales');
    expect(meta).toEqual({ kind: 'picker_insert' });
    expect(nextConfig.rows[0].items[2]).toEqual({ width: 1, chart: 'ref(existing-chart)' });
    // Sibling slots untouched; no chart was minted for a plain chart pick.
    expect(nextConfig.rows[0].items[0]).toEqual({ width: 6, chart: 'ref(existing-chart)' });
    expect(useStore.getState().saveChart).not.toHaveBeenCalled();
    // The picker closed on pick.
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();

    const evt = events.find(e => e.eventName === 'canvas_action');
    expect(evt.payload).toMatchObject({
      kind: 'add_item',
      source: 'picker',
      type: 'chart',
      name: 'existing-chart',
      dashboardName: 'sales',
      path: 'row.0.item.2',
    });
    expect(evt.payload.wrapped_chart).toBeUndefined();
  });

  test('picking an INSIGHT auto-wraps: mints <insight>-chart, saves it, places the wrapper (#637)', () => {
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-row-rev-insight'));

    expect(commit).toHaveBeenCalledTimes(1);
    const [, nextConfig, meta] = commit.mock.calls[0];
    expect(meta).toEqual({ kind: 'picker_insert' });
    expect(nextConfig.rows[0].items[2]).toEqual({ width: 1, chart: 'ref(rev-insight-chart)' });
    expect(nextConfig.rows[0].items[2].insight).toBeUndefined();
    expect(useStore.getState().saveChart).toHaveBeenCalledWith('rev-insight-chart', {
      insights: ['ref(rev-insight)'],
    });

    const evt = events.find(e => e.eventName === 'canvas_action');
    expect(evt.payload).toMatchObject({
      kind: 'add_item',
      source: 'picker',
      type: 'insight',
      name: 'rev-insight',
      wrapped_chart: 'rev-insight-chart',
      dashboardName: 'sales',
      path: 'row.0.item.2',
    });
  });

  test('the minted wrapper name disambiguates with -2 against existing charts', () => {
    useStore.setState({
      charts: [{ name: 'existing-chart' }, { name: 'rev-insight-chart' }],
    });
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-row-rev-insight'));

    const [, nextConfig] = commit.mock.calls[0];
    expect(nextConfig.rows[0].items[2].chart).toBe('ref(rev-insight-chart-2)');
    expect(useStore.getState().saveChart).toHaveBeenCalledWith('rev-insight-chart-2', {
      insights: ['ref(rev-insight)'],
    });
  });

  test('a REJECTED placement (invalid slot path) mints NOTHING — no commit, no orphan chart', () => {
    mockEmptySlotPath = 'row.9.item.9';
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-row-rev-insight'));

    expect(commit).not.toHaveBeenCalled();
    expect(useStore.getState().saveChart).not.toHaveBeenCalled();
    expect(events.find(e => e.eventName === 'canvas_action')).toBeUndefined();
  });

  test('closing the picker commits nothing', () => {
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-close'));
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
    expect(useStore.getState().saveChart).not.toHaveBeenCalled();
  });

  test('Create-new from the picker routes to the chart create modal with source picker', () => {
    renderCanvas();
    openPicker();
    fireEvent.click(screen.getByTestId('reference-picker-create'));
    expect(useStore.getState().openCreateChartModal).toHaveBeenCalledTimes(1);
    expect(events.find(e => e.eventName === 'inline_create_used')?.payload).toEqual({
      source: 'picker',
      kind: 'chart',
    });
    // The picker closed so the create modal isn't stacked under it.
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();
  });
});
