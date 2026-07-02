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
// Controllable context value so tests can also exercise the "no commit
// function" guard (mockCommitValue = undefined).
let mockCommitValue;
jest.mock('../../workspace/WorkspaceDndContext', () => ({
  useWorkspaceCommit: () => mockCommitValue,
}));

const Harness = ({ dashboardName }) => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <CanvasAddRow rootRef={rootRef} dashboardName={dashboardName} />
    </div>
  );
};

/**
 * DomHarness: mirrors the live canvas DOM — top-level rows carrying
 * `data-canvas-path` (the scheme CanvasDndLayer / CanvasAddRow measure) — so
 * the between-rows gap pills are measured + rendered.
 */
const DomHarness = ({ dashboardName }) => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="row-el-0" data-canvas-path="row.0">
        row 0
      </div>
      <div data-testid="row-el-1" data-canvas-path="row.1">
        row 1
      </div>
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
  mockCommitValue = mockCommit;
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

  test('clicking the end trigger again toggles the menu closed', () => {
    render(<Harness dashboardName="dash" />);
    fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
    expect(screen.getByTestId('row-template-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
    expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
  });

  test('renders nothing for an unknown dashboard', () => {
    render(<Harness dashboardName="nope" />);
    expect(screen.queryByTestId('canvas-add-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-add-row-empty')).not.toBeInTheDocument();
  });

  test('an unattached root renders the end trigger without gap pills (no crash)', () => {
    const { unmount } = render(
      <CanvasAddRow rootRef={{ current: null }} dashboardName="dash" />
    );
    expect(screen.getByTestId('canvas-add-row-end-button')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-add-row-gap-1')).not.toBeInTheDocument();
    unmount();
  });

  describe('between-rows gap pills (hover-reveal)', () => {
    test('hovering the inter-row gap reveals the pill; leaving hides it', () => {
      render(<DomHarness dashboardName="dash" />);
      const gap = screen.getByTestId('canvas-add-row-gap-1');
      // Pill hidden until hover.
      expect(screen.queryByTestId('canvas-add-row-gap-button-1')).not.toBeInTheDocument();
      fireEvent.mouseEnter(gap);
      expect(screen.getByTestId('canvas-add-row-gap-button-1')).toBeInTheDocument();
      fireEvent.mouseLeave(gap);
      expect(screen.queryByTestId('canvas-add-row-gap-button-1')).not.toBeInTheDocument();
    });

    test('gap pill → pick template → inserts the row AT the gap index', () => {
      render(<DomHarness dashboardName="dash" />);
      fireEvent.mouseEnter(screen.getByTestId('canvas-add-row-gap-1'));
      fireEvent.click(screen.getByTestId('canvas-add-row-gap-button-1'));
      expect(screen.getByTestId('row-template-menu')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('row-template-kpi'));
      expect(mockCommit).toHaveBeenCalledTimes(1);
      const [name, nextConfig] = mockCommit.mock.calls[0];
      expect(name).toBe('dash');
      expect(nextConfig.rows).toHaveLength(3);
      // Inserted between row 0 (medium) and old row 1 (small).
      expect(nextConfig.rows[1].items.map(i => i.width)).toEqual([3, 3, 3, 3]);
      expect(nextConfig.rows.map(r => r.height)).toEqual(['medium', 'medium', 'small']);
    });

    test('clicking the gap pill again toggles its menu closed (stays hover-revealed)', () => {
      render(<DomHarness dashboardName="dash" />);
      fireEvent.mouseEnter(screen.getByTestId('canvas-add-row-gap-1'));
      fireEvent.click(screen.getByTestId('canvas-add-row-gap-button-1'));
      expect(screen.getByTestId('row-template-menu')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('canvas-add-row-gap-button-1'));
      expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
    });
  });

  describe('menu dismissal', () => {
    test('a pointer press OUTSIDE the open menu closes it; inside it does not', () => {
      render(<Harness dashboardName="dash" />);
      fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
      const menu = screen.getByTestId('row-template-menu');

      // A press inside the menu (on a template) must NOT dismiss it.
      fireEvent.pointerDown(screen.getByTestId('row-template-blank'));
      expect(menu).toBeInTheDocument();

      // A press anywhere else dismisses it (never stranded behind content).
      fireEvent.pointerDown(document.body);
      expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
    });

    test('Escape inside the menu dismisses it (end trigger)', () => {
      render(<Harness dashboardName="dash" />);
      fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
      fireEvent.keyDown(screen.getByTestId('row-template-blank'), { key: 'Escape' });
      expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
    });

    test('Escape inside the menu dismisses it (empty-canvas CTA)', () => {
      setDashboards([{ name: 'empty-dash', config: { rows: [] } }]);
      render(<Harness dashboardName="empty-dash" />);
      fireEvent.click(screen.getByTestId('canvas-add-row-empty-button'));
      fireEvent.keyDown(screen.getByTestId('row-template-blank'), { key: 'Escape' });
      expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
    });
  });

  test('picking a template with no commit function closes the menu without committing', () => {
    mockCommitValue = undefined;
    render(<Harness dashboardName="dash" />);
    fireEvent.click(screen.getByTestId('canvas-add-row-end-button'));
    fireEvent.click(screen.getByTestId('row-template-blank'));
    expect(mockCommit).not.toHaveBeenCalled();
    // The guard path dismisses immediately (no 220ms flash).
    expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
  });
});
