/**
 * ProjectViewFlipLayer tests (VIS-788 / I-1 — View-mode item-action kebab).
 *
 * The View-mode per-item actions (Copy link, Flip to lineage) are consolidated
 * into ONE kebab (⋮) menu per slot (replacing the old standalone flip button).
 * This layer paints the kebab on the hovered leaf slot; opening it reveals the
 * action list, and "Flip to lineage" opens the SAME delivered lineage card
 * (<LibraryRowFlipPopover> → shared <MiniLineageCard>) the build canvas uses.
 * The only View-mode difference is that Expand deep-links to
 * /workspace?edit=<type>:<name> (no right rail in View). The card is mocked to a
 * marker; this suite locks the kebab GATING (leaf vs container), the action menu
 * (Copy + Flip), the multi-flip set, and the Expand deep link.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectViewFlipLayer from './ProjectViewFlipLayer';
import { setWorkspaceTelemetryListener } from '../new-views/workspace/telemetry';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockCopy = jest.fn();
jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: (...args) => mockCopy(...args),
}));

// Mock the in-place flip card to a marker carrying its subject + the box it was
// positioned at + an Expand button that invokes the passed onExpand (so we
// assert the View-mode deep link), plus a close button.
jest.mock('./ItemFlipCard', () => ({
  obj,
  box,
  onClose,
  onExpand,
  testIdPrefix,
}) => (
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

const CONFIG = {
  rows: [
    {
      items: [
        { width: 6, chart: 'ref(rev_chart)' },
        { width: 6, rows: [{ items: [{ chart: 'ref(inner)' }] }] }, // container
      ],
    },
  ],
};

const Host = ({ config = CONFIG }) => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="r0">
        <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
      </div>
      <ProjectViewFlipLayer rootRef={rootRef} dashboardConfig={config} />
    </div>
  );
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockCopy.mockClear();
  Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 };
  };
});

const menuButtons = () => screen.queryAllByTestId(/^view-item-menu-[^l]/);
const menuButton = key => screen.getByTestId(`view-item-menu-${key}`);
const hover = testid => fireEvent.pointerMove(screen.getByTestId(testid));
const openMenu = key => fireEvent.click(menuButton(key));
const action = (id, key) => screen.getByTestId(`view-item-action-${id}-${key}`);

describe('ProjectViewFlipLayer kebab (VIS-788)', () => {
  test('no kebab at rest (nothing hovered)', () => {
    render(<Host />);
    expect(menuButtons()).toHaveLength(0);
  });

  test('hovering a LEAF slot reveals the kebab', () => {
    render(<Host />);
    hover('r0i0');
    expect(menuButton('row.0.item.0')).toBeInTheDocument();
  });

  test('hovering a CONTAINER slot does NOT reveal a kebab', () => {
    render(<Host />);
    hover('r0i1');
    expect(menuButtons()).toHaveLength(0);
  });

  test('opening the kebab reveals Copy link + Flip to lineage actions', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    expect(action('copy', 'row.0.item.0')).toHaveTextContent('Copy link');
    expect(action('flip', 'row.0.item.0')).toHaveTextContent('Flip to lineage');
  });

  test('Copy link copies the current URL with element_id', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('copy', 'row.0.item.0'));
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.calls[0][0]).toContain('element_id=');
  });

  test('Flip to lineage opens the lineage card for that slot', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    const card = screen.getByTestId('view-flip-card-row.0.item.0');
    expect(card).toHaveAttribute('data-subject', 'chart:rev_chart');
  });

  test('flipping fires item_flipped telemetry with surface: view (§3.4 / Q3b)', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      render(<Host />);
      hover('r0i0');
      openMenu('row.0.item.0');
      fireEvent.click(action('flip', 'row.0.item.0'));
      // Closing the flip must NOT emit a second event.
      openMenu('row.0.item.0');
      fireEvent.click(action('flip', 'row.0.item.0'));
    } finally {
      unsubscribe();
    }
    const flips = events.filter(e => e.eventName === 'item_flipped');
    expect(flips).toHaveLength(1);
    expect(flips[0].payload).toEqual({
      surface: 'view',
      selector_edited: false,
      expanded_to_modal: false,
      type: 'chart',
      name: 'rev_chart',
    });
  });

  test('the flipped card overlays the SLOT box (in-place flip, not a beside popover)', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    const card = screen.getByTestId('view-flip-card-row.0.item.0');
    // The mocked slot box is top:0 left:0 400x200 — the card positions AT it,
    // not at rect.right+12 (which is what the old beside-popover did).
    expect(card).toHaveAttribute('data-box', '0,0,400,200');
  });

  test('flip entry reads "Hide lineage" while flipped and toggles closed', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.getByTestId('view-flip-card-row.0.item.0')).toBeInTheDocument();
    // Reopen the menu (selecting an action closes it) — entry now reads "Hide".
    openMenu('row.0.item.0');
    expect(action('flip', 'row.0.item.0')).toHaveTextContent('Hide lineage');
    fireEvent.click(action('flip', 'row.0.item.0'));
    expect(screen.queryByTestId('view-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });

  test('menu closes on Escape', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    expect(screen.getByTestId('view-item-menu-list-row.0.item.0')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByTestId('view-item-menu-list-row.0.item.0')
    ).not.toBeInTheDocument();
  });

  test('menu closes on outside click', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    expect(screen.getByTestId('view-item-menu-list-row.0.item.0')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByTestId('view-item-menu-list-row.0.item.0')
    ).not.toBeInTheDocument();
  });

  test('Expand deep-links to /workspace?edit=<type>:<name>&lens=lineage', () => {
    render(<Host />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    fireEvent.click(screen.getByTestId('view-flip-card-row.0.item.0-expand'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace?edit=chart:rev_chart&lens=lineage');
  });

  test('honors prefers-reduced-motion — no transition utility on the kebab', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    try {
      render(<Host />);
      hover('r0i0');
      const btn = menuButton('row.0.item.0');
      expect(btn.className).not.toContain('transition-colors');
    } finally {
      window.matchMedia = original;
    }
  });

  test('multi-flip — two leaf slots can be flipped at once', () => {
    const twoLeaves = {
      rows: [{ items: [{ chart: 'ref(rev_chart)' }, { chart: 'ref(cost_chart)' }] }],
    };
    render(<Host config={twoLeaves} />);
    hover('r0i0');
    openMenu('row.0.item.0');
    fireEvent.click(action('flip', 'row.0.item.0'));
    fireEvent.pointerMove(screen.getByTestId('r0i1'));
    openMenu('row.0.item.1');
    fireEvent.click(action('flip', 'row.0.item.1'));
    expect(screen.getByTestId('view-flip-card-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('view-flip-card-row.0.item.1')).toBeInTheDocument();
  });
});
