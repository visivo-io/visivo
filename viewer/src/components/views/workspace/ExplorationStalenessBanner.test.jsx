import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationStalenessBanner from './ExplorationStalenessBanner';

describe('ExplorationStalenessBanner', () => {
  test('renders the dangling refs and wires Re-check/Dismiss', () => {
    const onRecheck = jest.fn();
    const onDismiss = jest.fn();
    render(
      <ExplorationStalenessBanner
        danglingRefs={['orders_q', 'revenue']}
        onRecheck={onRecheck}
        onDismiss={onDismiss}
      />
    );
    const banner = screen.getByTestId('exploration-staleness-banner');
    expect(banner).toHaveTextContent('orders_q, revenue');

    fireEvent.click(screen.getByTestId('exploration-staleness-recheck'));
    expect(onRecheck).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('exploration-staleness-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('renders without a dangling-refs line when the list is empty', () => {
    render(<ExplorationStalenessBanner danglingRefs={[]} onRecheck={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('exploration-staleness-banner')).not.toHaveTextContent('No longer resolves');
  });

  // Phase 6c-T1 (ux-audit.md existing-objects #8): the drift line renders
  // when the seeded-from object was edited elsewhere — distinct copy from
  // the dangling-ref line, coexisting with it when both apply.
  test('renders the drift line naming the seeded object, in plain language (no "promoted"/"input" jargon)', () => {
    render(
      <ExplorationStalenessBanner
        danglingRefs={[]}
        driftedFrom={{ type: 'insight', name: 'aggregated_bar' }}
        onRecheck={jest.fn()}
        onDismiss={jest.fn()}
      />
    );
    const drift = screen.getByTestId('exploration-staleness-drift');
    expect(drift).toHaveTextContent('aggregated_bar');
    expect(drift).toHaveTextContent('changed in the project since this copy was made');
    expect(drift).not.toHaveTextContent('promoted');
  });

  test('renders neither the drift nor dangling-refs line when driftedFrom is null and danglingRefs is empty', () => {
    render(
      <ExplorationStalenessBanner
        danglingRefs={[]}
        driftedFrom={null}
        onRecheck={jest.fn()}
        onDismiss={jest.fn()}
      />
    );
    expect(screen.queryByTestId('exploration-staleness-drift')).not.toBeInTheDocument();
  });

  test('renders both the drift line and the dangling-refs line together when both apply', () => {
    render(
      <ExplorationStalenessBanner
        danglingRefs={['deleted_model']}
        driftedFrom={{ type: 'insight', name: 'aggregated_bar' }}
        onRecheck={jest.fn()}
        onDismiss={jest.fn()}
      />
    );
    expect(screen.getByTestId('exploration-staleness-drift')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-staleness-banner')).toHaveTextContent('deleted_model');
  });
});
