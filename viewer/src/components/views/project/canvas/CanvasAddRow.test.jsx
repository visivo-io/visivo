/**
 * CanvasAddRow tests (VIS-794 / Track D D-7 + D-8).
 *
 * The "+ Add Row" affordance layer over the canvas. We mock the shell commit
 * context + router and drive the menu → template-pick → commit path. Live
 * between-rows hover geometry is exercised by the Playwright story; here we lock
 * the empty-canvas CTA, the end-of-canvas trigger, the template commit, and the
 * inline-create telemetry.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CanvasAddRow from './CanvasAddRow';
import useStore from '../../../../stores/store';
import { setWorkspaceTelemetryListener } from '../../workspace/telemetry';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockCommit = jest.fn();
jest.mock('../../workspace/WorkspaceDndContext', () => ({
  useWorkspaceCommit: () => mockCommit,
}));

const Harness = ({ dashboardName }) => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <CanvasAddRow rootRef={rootRef} dashboardName={dashboardName} />
    </div>
  );
};

const setDashboards = dashboards => {
  act(() => {
    useStore.setState({ dashboards });
  });
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockCommit.mockClear();
});

describe('CanvasAddRow — empty canvas (D-8)', () => {
  beforeEach(() => {
    setDashboards([{ name: 'empty-dash', config: { rows: [] } }]);
  });

  test('renders the prominent empty CTA + helper copy', () => {
    render(<Harness dashboardName="empty-dash" />);
    expect(screen.getByTestId('canvas-add-row-empty')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-add-row-empty-button')).toBeInTheDocument();
    expect(screen.getByText(/pick a row template/i)).toBeInTheDocument();
  });

  test('opening the menu then picking a template commits a templated row at index 0', () => {
    render(<Harness dashboardName="empty-dash" />);
    fireEvent.click(screen.getByTestId('canvas-add-row-empty-button'));
    expect(screen.getByTestId('row-template-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('row-template-3up'));
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = mockCommit.mock.calls[0];
    expect(name).toBe('empty-dash');
    expect(nextConfig.rows).toHaveLength(1);
    expect(nextConfig.rows[0].items.map(i => i.width)).toEqual([4, 4, 4]);
  });

  test('fires canvas_action add_row telemetry on template select', () => {
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    render(<Harness dashboardName="empty-dash" />);
    fireEvent.click(screen.getByTestId('canvas-add-row-empty-button'));
    fireEvent.click(screen.getByTestId('row-template-blank'));
    unsub();
    const addRow = events.find(e => e.eventName === 'canvas_action');
    expect(addRow).toBeTruthy();
    expect(addRow.payload).toMatchObject({ kind: 'add_row', template: 'blank' });
  });

  test('inline-create fires inline_create_used and routes to the Explorer', () => {
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    render(<Harness dashboardName="empty-dash" />);
    fireEvent.click(screen.getByTestId('canvas-inline-create-chart'));
    unsub();
    // §3.4 payload convention: source (initiating surface) + kind (object type).
    expect(events.find(e => e.eventName === 'inline_create_used')?.payload).toEqual({
      source: 'canvas',
      kind: 'chart',
      dashboardName: 'empty-dash',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/explorer?create=chart');
  });
});

describe('CanvasAddRow — populated canvas (D-7)', () => {
  beforeEach(() => {
    setDashboards([
      {
        name: 'dash',
        config: {
          rows: [
            { height: 'medium', items: [{ width: 12, chart: 'ref(a)' }] },
            { height: 'small', items: [{ width: 12, chart: 'ref(b)' }] },
          ],
        },
      },
    ]);
  });

  test('renders the end-of-canvas Add row trigger', () => {
    render(<Harness dashboardName="dash" />);
    expect(screen.getByTestId('canvas-add-row-end-button')).toBeInTheDocument();
    // The empty CTA is NOT shown when rows exist.
    expect(screen.queryByTestId('canvas-add-row-empty')).not.toBeInTheDocument();
  });

  test('end trigger → pick template → appends a row at the end', () => {
    render(<Harness dashboardName="dash" />);
    fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
    fireEvent.click(screen.getByTestId('row-template-2up'));
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    expect(nextConfig.rows).toHaveLength(3);
    expect(nextConfig.rows[2].items.map(i => i.width)).toEqual([6, 6]);
  });
});
