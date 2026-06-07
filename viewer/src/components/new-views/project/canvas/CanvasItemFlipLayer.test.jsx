/**
 * CanvasItemFlipLayer tests (VIS-785 / Track D D-6).
 *
 * The flip layer paints a flip toggle on the hovered/selected leaf item and
 * opens its lineage card (the delivered LibraryRowFlipPopover) on click. The
 * popover is portal + store heavy, so it's mocked to a marker here — this test
 * locks the flip GATING (leaf vs container, drag suppression), the multi-flip
 * set, and the `item_flipped` telemetry. The popover's own lineage rendering is
 * covered by its own suite.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CanvasItemFlipLayer from './CanvasItemFlipLayer';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../../workspace/telemetry';

jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: jest.fn(),
}));

// Mock the heavy lineage popover to a simple marker carrying its subject + a
// close button, so we assert open/close + multi-flip without the portal walker.
jest.mock('../../workspace/library/LibraryRowFlipPopover', () => ({ obj, onClose, testIdPrefix }) => (
  <div data-testid={`${testIdPrefix}`} data-subject={`${obj.type}:${obj.name}`}>
    <button data-testid={`${testIdPrefix}-close`} onClick={onClose}>
      close
    </button>
  </div>
));

// useWorkspaceDrag is read from the DnD context; default to "no drag".
let mockDrag = null;
jest.mock('../../workspace/WorkspaceDndContext', () => ({
  useWorkspaceDrag: () => mockDrag,
}));

const DASH = {
  name: 'dash',
  config: {
    rows: [
      {
        items: [
          { width: 6, chart: 'ref(rev_chart)' },
          { width: 6, rows: [{ items: [{ chart: 'ref(inner)' }] }] }, // container
        ],
      },
    ],
  },
};

const Host = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="r0">
        <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
      </div>
      <CanvasItemFlipLayer rootRef={rootRef} dashboardName="dash" />
    </div>
  );
};

beforeEach(() => {
  mockDrag = null;
  emitWorkspaceEvent.mockClear();
  useStore.setState({
    dashboards: [DASH],
    workspaceCanvasHoverKey: null,
    workspaceOutlineSelectedKey: 'dashboard',
  });
  Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 };
  };
});

const setHover = key => useStore.setState({ workspaceCanvasHoverKey: key });
// Flip buttons are keyed per-item (`canvas-flip-button-<path>`); these helpers
// query the set / a specific one.
const flipButtons = () => screen.queryAllByTestId(/^canvas-flip-button-/);
const flipButton = key => screen.getByTestId(`canvas-flip-button-${key}`);

describe('CanvasItemFlipLayer (VIS-785)', () => {
  test('no flip button at rest (nothing hovered/selected)', () => {
    render(<Host />);
    expect(flipButtons()).toHaveLength(0);
  });

  test('hovering a LEAF item reveals the flip button', () => {
    setHover('row.0.item.0');
    render(<Host />);
    expect(flipButton('row.0.item.0')).toBeInTheDocument();
  });

  test('hovering a CONTAINER item does NOT reveal a flip button (no single subject)', () => {
    setHover('row.0.item.1');
    render(<Host />);
    expect(flipButtons()).toHaveLength(0);
  });

  test('clicking flip opens the lineage card for that item + fires item_flipped', () => {
    setHover('row.0.item.0');
    render(<Host />);
    fireEvent.click(flipButton('row.0.item.0'));
    const card = screen.getByTestId('canvas-flip-card-row.0.item.0');
    expect(card).toHaveAttribute('data-subject', 'chart:rev_chart');
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'item_flipped',
      expect.objectContaining({ surface: 'build', type: 'chart', name: 'rev_chart' })
    );
  });

  test('flip is a toggle — clicking again closes the card', () => {
    setHover('row.0.item.0');
    render(<Host />);
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // The button stays mounted while flipped, so it can toggle back.
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.queryByTestId('canvas-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });

  test('multi-flip — two items can be flipped at once', () => {
    // A row of two leaf items so both item.0 and item.1 are flippable.
    useStore.setState({
      dashboards: [
        {
          name: 'dash',
          config: {
            rows: [{ items: [{ chart: 'ref(rev_chart)' }, { chart: 'ref(cost_chart)' }] }],
          },
        },
      ],
      workspaceCanvasHoverKey: 'row.0.item.0',
    });
    const { rerender } = render(<Host />);
    // Flip the first item.
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // Hover-move to the second item and flip it (setState wrapped in act).
    act(() => {
      useStore.setState({ workspaceCanvasHoverKey: 'row.0.item.1' });
    });
    rerender(<Host />);
    fireEvent.click(flipButton('row.0.item.1'));
    // Both cards are open simultaneously (multi-flip, Q3b).
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-flip-card-row.0.item.1')).toBeInTheDocument();
  });

  test('a drag suppresses the flip affordance + any open cards', () => {
    setHover('row.0.item.0');
    const { rerender } = render(<Host />);
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // A drag begins.
    mockDrag = { kind: 'canvas', canvasKind: 'item' };
    rerender(<Host />);
    expect(flipButtons()).toHaveLength(0);
    expect(screen.queryByTestId('canvas-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });
});
