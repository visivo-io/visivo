/**
 * ExplorationCard — one Explorer Home gallery card (01-ux-spec.md §2):
 * name / edit time / draft summary / provenance chip, Open + ⋮ (rename ·
 * duplicate · delete).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationCard from './ExplorationCard';

const exploration = overrides => ({
  id: 'exp_1',
  name: 'Churn dig',
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  seededFrom: null,
  draft: { queries: [{ name: 'q' }], insights: [{ name: 'i' }], chart: null, computedColumns: [] },
  promoted: [],
  ...overrides,
});

describe('ExplorationCard', () => {
  test('renders the name, edit time, and query/insight summary', () => {
    render(
      <ExplorationCard
        exploration={exploration()}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByTestId('exploration-card-exp_1-name')).toHaveTextContent('Churn dig');
    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
    expect(screen.getByText(/1 quer(y|ies)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 insight/i)).toBeInTheDocument();
  });

  test('pluralizes "queries"/"insights" when there is more than one, omits the edit-time label when updatedAt is absent, and never throws when `promoted` is omitted entirely', () => {
    render(
      <ExplorationCard
        exploration={exploration({
          updatedAt: null,
          promoted: undefined,
          draft: {
            queries: [{ name: 'a' }, { name: 'b' }],
            insights: [{ name: 'x' }, { name: 'y' }],
            chart: null,
            computedColumns: [],
          },
        })}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText(/2 queries/i)).toBeInTheDocument();
    expect(screen.getByText(/2 insights/i)).toBeInTheDocument();
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });

  // Explore 2.0 Phase 4 (01-ux-spec.md §2): "promotion count arrives in Phase 4".
  test('omits the promoted count when nothing has been promoted yet', () => {
    render(
      <ExplorationCard
        exploration={exploration({ promoted: [] })}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByTestId('exploration-card-exp_1-summary')).not.toHaveTextContent('promoted');
  });

  test('shows the promoted count once the exploration has real promotions', () => {
    render(
      <ExplorationCard
        exploration={exploration({
          promoted: [
            { type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:00:00Z' },
            { type: 'insight', name: 'churn_by_cohort', promoted_at: '2026-01-01T00:00:01Z' },
          ],
        })}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByTestId('exploration-card-exp_1-summary')).toHaveTextContent('2 promoted');
  });

  test('renders a provenance chip when seededFrom is set', () => {
    render(
      <ExplorationCard
        exploration={exploration({ seededFrom: { type: 'model', name: 'orders' } })}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText(/from model: orders/i)).toBeInTheDocument();
  });

  test('does not render a provenance chip when seededFrom is null', () => {
    render(
      <ExplorationCard
        exploration={exploration()}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.queryByText(/from /i)).not.toBeInTheDocument();
  });

  // D10 (e2e-gap-review.md "Final delta pass"): a minted `return_to`
  // placement intent was previously invisible everywhere in the UI — this
  // card looked identical to a throwaway scratch exploration.
  describe('return_to placement-intent chip (D10)', () => {
    test('renders a "→ <dashboard>" chip when return_to is set', () => {
      render(
        <ExplorationCard
          exploration={exploration({ returnTo: { dashboard: 'sales', slot: 'r1-i1' } })}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      const chip = screen.getByTestId('exploration-card-exp_1-return-to');
      expect(chip).toHaveTextContent('sales');
      expect(chip).toHaveAttribute('title', expect.stringContaining('sales'));
    });

    test('does not render the return_to chip when return_to is null', () => {
      render(
        <ExplorationCard
          exploration={exploration({ returnTo: null })}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      expect(screen.queryByTestId('exploration-card-exp_1-return-to')).not.toBeInTheDocument();
    });

    test('renders BOTH the seededFrom and return_to chips together when both are set', () => {
      render(
        <ExplorationCard
          exploration={exploration({
            seededFrom: { type: 'model', name: 'orders' },
            returnTo: { dashboard: 'sales' },
          })}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      expect(screen.getByText(/from model: orders/i)).toBeInTheDocument();
      expect(screen.getByTestId('exploration-card-exp_1-return-to')).toHaveTextContent('sales');
    });
  });

  test('Open calls onOpen with the exploration id', () => {
    const onOpen = jest.fn();
    render(
      <ExplorationCard
        exploration={exploration()}
        onOpen={onOpen}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-open'));
    expect(onOpen).toHaveBeenCalledWith('exp_1');
  });

  // Phase 6c-T5 (ux-audit.md "cards only open via small 'Open' button" —
  // "Make the whole card clickable" direction).
  describe('whole-card clickability (Phase 6c-T5)', () => {
    test('clicking anywhere on the card body calls onOpen', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('exploration-card-exp_1'));
      expect(onOpen).toHaveBeenCalledWith('exp_1');
    });

    test('clicking the card name text also calls onOpen', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-name'));
      expect(onOpen).toHaveBeenCalledWith('exp_1');
    });

    test('Enter/Space on the focused card also calls onOpen (keyboard accessibility)', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      const card = screen.getByTestId('exploration-card-exp_1');
      fireEvent.keyDown(card, { key: 'Enter' });
      fireEvent.keyDown(card, { key: ' ' });
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(onOpen).toHaveBeenCalledWith('exp_1');
    });

    test('an unrelated key does nothing', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.keyDown(screen.getByTestId('exploration-card-exp_1'), { key: 'Tab' });
      expect(onOpen).not.toHaveBeenCalled();
    });

    test('opening the ⋮ menu does NOT also call onOpen (propagation stopped)', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
      expect(onOpen).not.toHaveBeenCalled();
    });

    test('starting an inline rename does NOT also call onOpen (propagation stopped)', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-rename-action'));
      expect(screen.getByTestId('exploration-card-exp_1-rename-input')).toBeInTheDocument();
      expect(onOpen).not.toHaveBeenCalled();

      // Clicking INSIDE the now-open rename input area (not just the menu
      // action that opened it) must also never bubble into onOpen.
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-rename-input'));
      expect(onOpen).not.toHaveBeenCalled();
    });

    test('clicking the "Open" button still calls onOpen exactly once (no double-fire from bubbling)', () => {
      const onOpen = jest.fn();
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={onOpen}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('exploration-card-exp_1-open'));
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });

  test('the ⋮ menu Duplicate action calls onDuplicate with the id', () => {
    const onDuplicate = jest.fn();
    render(
      <ExplorationCard
        exploration={exploration()}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={onDuplicate}
        onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-duplicate-action'));
    expect(onDuplicate).toHaveBeenCalledWith('exp_1');
  });

  test('the ⋮ menu Delete action calls onDelete with the full exploration record', () => {
    const onDelete = jest.fn();
    const record = exploration();
    render(
      <ExplorationCard
        exploration={record}
        onOpen={jest.fn()}
        onRename={jest.fn()}
        onDuplicate={jest.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-delete-action'));
    expect(onDelete).toHaveBeenCalledWith(record);
  });

  test('the ⋮ menu Rename action swaps the name for an inline input; committing calls onRename', () => {
    const onRename = jest.fn();
    render(
      <ExplorationCard
        exploration={exploration()}
        onOpen={jest.fn()}
        onRename={onRename}
        onDuplicate={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-rename-action'));

    expect(screen.queryByTestId('exploration-card-exp_1-name')).not.toBeInTheDocument();
    const input = screen.getByTestId('exploration-card-exp_1-rename-input');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('exp_1', 'Renamed');
  });

  // VIS-1070 — staleness badge (01-ux-spec.md §2's "⚠ stale (orders
  // changed)" end-state). `stale`/`danglingRefs` are computed by the PARENT
  // (ExplorerHomePane) and just rendered here.
  describe('staleness badge (VIS-1070)', () => {
    test('no badge by default', () => {
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
        />
      );
      expect(screen.queryByTestId('exploration-card-exp_1-stale')).not.toBeInTheDocument();
    });

    test('renders the badge with dangling refs in the tooltip when stale', () => {
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
          stale
          danglingRefs={['deleted_model']}
        />
      );
      const badge = screen.getByTestId('exploration-card-exp_1-stale');
      expect(badge).toHaveTextContent('stale');
      expect(badge).toHaveAttribute('title', expect.stringContaining('deleted_model'));
    });

    test('falls back to a generic title when stale with no specific dangling refs given', () => {
      render(
        <ExplorationCard
          exploration={exploration()}
          onOpen={jest.fn()}
          onRename={jest.fn()}
          onDuplicate={jest.fn()}
          onDelete={jest.fn()}
          stale
        />
      );
      expect(screen.getByTestId('exploration-card-exp_1-stale')).toHaveAttribute(
        'title',
        'This exploration references objects that may have changed'
      );
    });
  });
});
