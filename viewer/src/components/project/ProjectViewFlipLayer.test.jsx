/**
 * ProjectViewFlipLayer tests (VIS-788 / I-1 — View-mode flip gesture).
 *
 * Per Q3b the flip-to-lineage gesture also lives in View mode. This layer paints
 * a flip toggle on the hovered leaf slot and opens the SAME delivered lineage
 * card (<LibraryRowFlipPopover> → shared <MiniLineageCard>) the build canvas
 * uses — the only View-mode difference is that Expand deep-links to
 * /workspace?edit=<type>:<name> (no right rail in View). The card is mocked to a
 * marker; this suite locks the flip GATING (leaf vs container), the multi-flip
 * set, and the Expand deep link.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectViewFlipLayer from './ProjectViewFlipLayer';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock the heavy lineage popover to a marker carrying its subject + an Expand
// button that invokes the passed onExpand (so we assert the View-mode deep link).
jest.mock('../new-views/workspace/library/LibraryRowFlipPopover', () => ({
  obj,
  onClose,
  onExpand,
  testIdPrefix,
}) => (
  <div data-testid={`${testIdPrefix}`} data-subject={`${obj.type}:${obj.name}`}>
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
  Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 };
  };
});

const flipButtons = () => screen.queryAllByTestId(/^view-flip-button-/);
const flipButton = key => screen.getByTestId(`view-flip-button-${key}`);
const hover = testid => fireEvent.pointerMove(screen.getByTestId(testid));

describe('ProjectViewFlipLayer (VIS-788)', () => {
  test('no flip button at rest (nothing hovered)', () => {
    render(<Host />);
    expect(flipButtons()).toHaveLength(0);
  });

  test('hovering a LEAF slot reveals the flip button', () => {
    render(<Host />);
    hover('r0i0');
    expect(flipButton('row.0.item.0')).toBeInTheDocument();
  });

  test('hovering a CONTAINER slot does NOT reveal a flip button', () => {
    render(<Host />);
    hover('r0i1');
    expect(flipButtons()).toHaveLength(0);
  });

  test('clicking flip opens the lineage card for that slot', () => {
    render(<Host />);
    hover('r0i0');
    fireEvent.click(flipButton('row.0.item.0'));
    const card = screen.getByTestId('view-flip-card-row.0.item.0');
    expect(card).toHaveAttribute('data-subject', 'chart:rev_chart');
  });

  test('flip is a toggle — clicking again closes the card', () => {
    render(<Host />);
    hover('r0i0');
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.getByTestId('view-flip-card-row.0.item.0')).toBeInTheDocument();
    fireEvent.click(flipButton('row.0.item.0'));
    expect(screen.queryByTestId('view-flip-card-row.0.item.0')).not.toBeInTheDocument();
  });

  test('Expand deep-links to /workspace?edit=<type>:<name>', () => {
    render(<Host />);
    hover('r0i0');
    fireEvent.click(flipButton('row.0.item.0'));
    fireEvent.click(screen.getByTestId('view-flip-card-row.0.item.0-expand'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace?edit=chart:rev_chart');
  });

  test('multi-flip — two leaf slots can be flipped at once', () => {
    const twoLeaves = {
      rows: [{ items: [{ chart: 'ref(rev_chart)' }, { chart: 'ref(cost_chart)' }] }],
    };
    render(<Host config={twoLeaves} />);
    hover('r0i0');
    fireEvent.click(flipButton('row.0.item.0'));
    fireEvent.pointerMove(screen.getByTestId('r0i1'));
    fireEvent.click(flipButton('row.0.item.1'));
    expect(screen.getByTestId('view-flip-card-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('view-flip-card-row.0.item.1')).toBeInTheDocument();
  });
});
