/**
 * ItemFlipCard tests — true in-place flip card.
 *
 * ItemFlipCard overlays the chart's OWN slot box (reading as the chart flipping
 * over) and embeds the shared <MiniLineageCard>. This suite locks:
 *   - it positions at the slot box (top/left/width/height),
 *   - it embeds MiniLineageCard with the obj + testIdPrefix,
 *   - onClose fires from both its own flip-back ✕ and the embedded card,
 *   - onExpand fires from the embedded card,
 *   - the min-size clamp grows a small slot to the minimum usable footprint,
 *   - a slot bigger than the minimum just fills the slot.
 *
 * MiniLineageCard is mocked to a marker (its own suite covers lineage rendering).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemFlipCard, { MIN_WIDTH, MIN_HEIGHT } from './ItemFlipCard';

// Mock the shared lineage body to a marker echoing its props + an Expand button.
jest.mock('../new-views/workspace/library/MiniLineageCard', () => ({
  __esModule: true,
  default: ({ obj, onClose, onExpand, testIdPrefix }) => (
    <div data-testid={`${testIdPrefix}-mini`} data-subject={`${obj.type}:${obj.name}`}>
      <button data-testid={`${testIdPrefix}-mini-close`} onClick={onClose}>
        close
      </button>
      <button data-testid={`${testIdPrefix}-mini-expand`} onClick={() => onExpand(obj)}>
        expand
      </button>
    </div>
  ),
}));

const OBJ = { type: 'chart', name: 'aapl_pnl' };
const PREFIX = 'flip-card';

beforeEach(() => {
  // A roomy viewport so the clamp never trims the min-size cases below.
  window.innerWidth = 1600;
  window.innerHeight = 1200;
});

const card = () => screen.getByTestId(PREFIX);

describe('ItemFlipCard positioning', () => {
  test('positions at the slot box top/left for a wide slot', () => {
    render(
      <ItemFlipCard
        box={{ top: 50, left: 120, width: 800, height: 400 }}
        obj={OBJ}
        onClose={jest.fn()}
        onExpand={jest.fn()}
        testIdPrefix={PREFIX}
      />
    );
    const el = card();
    expect(el.style.top).toBe('50px');
    expect(el.style.left).toBe('120px');
    // Wide slot exceeds the min footprint → the card fills the slot exactly.
    expect(el.style.width).toBe('800px');
    expect(el.style.height).toBe('400px');
  });

  test('renders nothing without a box', () => {
    render(<ItemFlipCard box={null} obj={OBJ} onClose={jest.fn()} testIdPrefix={PREFIX} />);
    expect(screen.queryByTestId(PREFIX)).not.toBeInTheDocument();
  });

  test('renders nothing without an obj', () => {
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 200 }}
        obj={null}
        onClose={jest.fn()}
        testIdPrefix={PREFIX}
      />
    );
    expect(screen.queryByTestId(PREFIX)).not.toBeInTheDocument();
  });
});

describe('ItemFlipCard min-size clamp', () => {
  test('a small slot grows the card to the minimum usable footprint', () => {
    render(
      <ItemFlipCard
        box={{ top: 10, left: 10, width: 120, height: 80 }}
        obj={OBJ}
        onClose={jest.fn()}
        testIdPrefix={PREFIX}
      />
    );
    const el = card();
    // Grows from the slot's top-left to at least the minimums.
    expect(el.style.top).toBe('10px');
    expect(el.style.left).toBe('10px');
    expect(el.style.width).toBe(`${MIN_WIDTH}px`);
    expect(el.style.height).toBe(`${MIN_HEIGHT}px`);
  });
});

describe('ItemFlipCard embeds MiniLineageCard', () => {
  test('passes obj + testIdPrefix through to the shared card', () => {
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 300 }}
        obj={OBJ}
        onClose={jest.fn()}
        testIdPrefix={PREFIX}
      />
    );
    const mini = screen.getByTestId(`${PREFIX}-mini`);
    expect(mini).toHaveAttribute('data-subject', 'chart:aapl_pnl');
  });
});

describe('ItemFlipCard callbacks', () => {
  test('its own flip-back ✕ fires onClose', () => {
    const onClose = jest.fn();
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 300 }}
        obj={OBJ}
        onClose={onClose}
        testIdPrefix={PREFIX}
      />
    );
    fireEvent.click(screen.getByTestId(`${PREFIX}-flip-back`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the embedded card close fires onClose', () => {
    const onClose = jest.fn();
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 300 }}
        obj={OBJ}
        onClose={onClose}
        testIdPrefix={PREFIX}
      />
    );
    fireEvent.click(screen.getByTestId(`${PREFIX}-mini-close`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the embedded card expand fires onExpand with the subject', () => {
    const onExpand = jest.fn();
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 300 }}
        obj={OBJ}
        onClose={jest.fn()}
        onExpand={onExpand}
        testIdPrefix={PREFIX}
      />
    );
    fireEvent.click(screen.getByTestId(`${PREFIX}-mini-expand`));
    expect(onExpand).toHaveBeenCalledWith(OBJ);
  });
});

describe('ItemFlipCard reduced motion', () => {
  test('reduced motion drops the 3D rotation (no preserve-3d transform-style)', () => {
    render(
      <ItemFlipCard
        box={{ top: 0, left: 0, width: 400, height: 300 }}
        obj={OBJ}
        onClose={jest.fn()}
        reducedMotion
        testIdPrefix={PREFIX}
      />
    );
    // The inner face wrapper has no rotateY transform under reduced motion.
    const inner = screen.getByTestId(`${PREFIX}-face`);
    expect(inner.style.transform).toBe('');
  });
});
