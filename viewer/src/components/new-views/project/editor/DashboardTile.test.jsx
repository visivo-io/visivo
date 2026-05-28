import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import DashboardTile from './DashboardTile';

const tile = {
  name: 'revenue-overview',
  level: 'Organization',
  tags: ['exec', 'revenue'],
  itemCount: 8,
  updatedAt: null,
};

const renderTile = (props = {}) =>
  render(
    <DndContext>
      <DashboardTile tile={tile} {...props} />
    </DndContext>
  );

describe('DashboardTile', () => {
  test('renders the dashboard name, tags and item count', () => {
    renderTile();
    expect(screen.getByTestId('project-tile-revenue-overview')).toBeInTheDocument();
    expect(screen.getByText('revenue-overview')).toBeInTheDocument();
    expect(screen.getByText('exec')).toBeInTheDocument();
    expect(screen.getByText('revenue')).toBeInTheDocument();
    expect(screen.getByText('8 items')).toBeInTheDocument();
  });

  test('clicking the tile dispatches onSelect with the tile', () => {
    const onSelect = jest.fn();
    renderTile({ onSelect });
    fireEvent.click(screen.getByTestId('project-tile-revenue-overview'));
    expect(onSelect).toHaveBeenCalledWith(tile);
  });

  test('reflects the selected state via data attribute', () => {
    renderTile({ selected: true });
    expect(screen.getByTestId('project-tile-revenue-overview')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  test('renders a sensible footer label when item count is unknown', () => {
    render(
      <DndContext>
        <DashboardTile tile={{ name: 'd', tags: [], itemCount: null }} />
      </DndContext>
    );
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
