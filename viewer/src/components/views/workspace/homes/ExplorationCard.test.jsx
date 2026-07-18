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
});
