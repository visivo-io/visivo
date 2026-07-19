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
});
