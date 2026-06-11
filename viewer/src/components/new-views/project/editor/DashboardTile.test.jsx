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

  // Right-click context menu (VIS-811 / Track O O-2) -------------------------

  test('right-clicking a tile opens the Open / Open in new tab menu', () => {
    renderTile();
    fireEvent.contextMenu(screen.getByTestId('project-tile-revenue-overview'), {
      clientX: 50,
      clientY: 60,
    });
    expect(screen.getByTestId('project-tile-ctx-revenue-overview-menu')).toBeInTheDocument();
    expect(screen.getByTestId('project-tile-ctx-revenue-overview-open')).toBeInTheDocument();
    expect(
      screen.getByTestId('project-tile-ctx-revenue-overview-open-new-tab')
    ).toBeInTheDocument();
  });

  test('context-menu "Open" dispatches onSelect (replace current context) and dismisses', () => {
    const onSelect = jest.fn();
    const onOpenInNewTab = jest.fn();
    renderTile({ onSelect, onOpenInNewTab });
    fireEvent.contextMenu(screen.getByTestId('project-tile-revenue-overview'));
    fireEvent.click(screen.getByTestId('project-tile-ctx-revenue-overview-open'));
    expect(onSelect).toHaveBeenCalledWith(tile);
    expect(onOpenInNewTab).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('project-tile-ctx-revenue-overview-menu')
    ).not.toBeInTheDocument();
  });

  test('context-menu "Open in new tab" dispatches onOpenInNewTab, NOT onSelect', () => {
    const onSelect = jest.fn();
    const onOpenInNewTab = jest.fn();
    renderTile({ onSelect, onOpenInNewTab });
    fireEvent.contextMenu(screen.getByTestId('project-tile-revenue-overview'));
    fireEvent.click(screen.getByTestId('project-tile-ctx-revenue-overview-open-new-tab'));
    expect(onOpenInNewTab).toHaveBeenCalledWith(tile);
    // The portal click must not bubble into the tile's own onClick → onSelect.
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the tile context menu dismisses on Escape', () => {
    renderTile();
    fireEvent.contextMenu(screen.getByTestId('project-tile-revenue-overview'));
    expect(screen.getByTestId('project-tile-ctx-revenue-overview-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByTestId('project-tile-ctx-revenue-overview-menu')
    ).not.toBeInTheDocument();
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
