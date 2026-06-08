/**
 * CanvasItemFlipLayer tests (VIS-785 / Track D D-6).
 *
 * The canvas flip layer now renders the consolidated <ItemActionMenu> kebab (⋮)
 * on the hovered/selected leaf — the SAME menu View mode uses — with Copy link +
 * Flip to lineage. Flip opens the shared <ItemFlipCard> IN PLACE over the slot.
 * ItemFlipCard is store-heavy, so it's mocked to a marker that echoes its subject
 * + box. This suite locks: the kebab GATING (leaf vs container, drag
 * suppression), the controlled open/menu-hover state, the action menu (Copy +
 * Flip), the multi-flip set, the in-place box, Expand's deep link, and the
 * `item_flipped` telemetry.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CanvasItemFlipLayer from './CanvasItemFlipLayer';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../../workspace/telemetry';

jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockCopy = jest.fn();
jest.mock('../../../project/copyItemLink', () => ({
  __esModule: true,
  default: (...args) => mockCopy(...args),
}));

// Mock the in-place flip card to a marker carrying its subject + the box it was
// positioned at + close/expand buttons, so we assert open/close + multi-flip +
// that the card overlays the SLOT box + the Expand deep link.
jest.mock('../../../project/ItemFlipCard', () => ({ obj, box, onClose, onExpand, testIdPrefix }) => (
  <div
    data-testid={`${testIdPrefix}`}
    data-subject={`${obj.type}:${obj.name}`}
    data-box={box ? `${box.top},${box.left},${box.width},${box.height}` : ''}
  >
    <button data-testid={`${testIdPrefix}-close`} onClick={onClose}>
      close
    </button>
    <button data-testid={`${testIdPrefix}-expand`} onClick={onExpand}>
      expand
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
  mockNavigate.mockClear();
  mockCopy.mockClear();
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
// The kebab is keyed per-item (`view-item-menu-<path>`); these helpers query
// the set / a specific kebab button.
const menuButtons = () => screen.queryAllByTestId(/^view-item-menu-[^l]/);
const menuButton = key => screen.getByTestId(`view-item-menu-${key}`);
const openMenu = key => fireEvent.click(menuButton(key));
const action = (id, key) => screen.getByTestId(`view-item-action-${id}-${key}`);

describe('CanvasItemFlipLayer (VIS-785)', () => {
  test('no kebab at rest (nothing hovered/selected)', () => {
    render(<Host />);
    expect(menuButtons()).toHaveLength(0);
  });

  test('hovering a LEAF item reveals the kebab', () => {
    setHover('row.0.item.0');
    render(<Host />);
    expect(menuButton('row.0.item.0')).toBeInTheDocument();
  });

  test('hovering a CONTAINER item does NOT reveal a kebab (no single subject)', () => {
    setHover('row.0.item.1');
    render(<Host />);
    expect(menuButtons()).toHaveLength(0);
  });

  test('opening the kebab reveals Copy link + Flip to lineage actions', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    expect(action('copy', 'row.0.item.0')).toHaveTextContent('Copy link');
    expect(action('flip', 'row.0.item.0')).toHaveTextContent('Flip to lineage');
  });

  test('Copy link copies the current URL via the shared helper', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('copy', 'row.0.item.0'));
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  test('Flip opens the lineage card for that item + fires item_flipped', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    const card = screen.getByTestId('canvas-flip-card-row.0.item.0');
    expect(card).toHaveAttribute('data-subject', 'chart:rev_chart');
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'item_flipped',
      expect.objectContaining({ surface: 'build', type: 'chart', name: 'rev_chart' })
    );
  });

  test('the flipped card overlays the SLOT box (in-place flip, not beside it)', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    const card = screen.getByTestId('canvas-flip-card-row.0.item.0');
    // The mocked slot box is top:0 left:0 400x200 — the card positions AT it.
    expect(card).toHaveAttribute('data-box', '0,0,400,200');
  });

  test('flip entry reads "Hide lineage" while flipped and toggles closed', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // Reopen the menu (selecting an action closes it) — entry now reads "Hide".
    openMenu('row.0.item.0');
    expect(action('flip', 'row.0.item.0')).toHaveTextContent('Hide lineage');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.queryByTestId('canvas-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });

  test('the kebab survives the cursor reach (menu-hover keeps it mounted after hover clears)', () => {
    setHover('row.0.item.0');
    const { rerender } = render(<Host />);
    // Cursor moves onto the kebab wrapper — report hover up.
    fireEvent.pointerEnter(screen.getByTestId('view-item-menu-wrap-row.0.item.0'));
    // The canvas hover that spawned the kebab clears (cursor left the chart body).
    act(() => useStore.setState({ workspaceCanvasHoverKey: null }));
    rerender(<Host />);
    // The kebab is still mounted because the menu itself is hovered.
    expect(menuButton('row.0.item.0')).toBeInTheDocument();
  });

  test('Expand deep-links to /workspace?edit=<type>:<name>&lens=lineage', () => {
    setHover('row.0.item.0');
    render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    fireEvent.click(screen.getByTestId('canvas-flip-card-row.0.item.0-expand'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace?edit=chart:rev_chart&lens=lineage');
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
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // Hover-move to the second item and flip it (setState wrapped in act).
    act(() => {
      useStore.setState({ workspaceCanvasHoverKey: 'row.0.item.1' });
    });
    rerender(<Host />);
    openMenu('row.0.item.1');
    fireEvent.click(action('flip', 'row.0.item.1'));
    // Both cards are open simultaneously (multi-flip, Q3b).
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-flip-card-row.0.item.1')).toBeInTheDocument();
  });

  test('a drag suppresses the kebab + any open cards', () => {
    setHover('row.0.item.0');
    const { rerender } = render(<Host />);
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.getByTestId('canvas-flip-card-row.0.item.0')).toBeInTheDocument();
    // A drag begins.
    mockDrag = { kind: 'canvas', canvasKind: 'item' };
    rerender(<Host />);
    expect(menuButtons()).toHaveLength(0);
    expect(screen.queryByTestId('canvas-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });
});
