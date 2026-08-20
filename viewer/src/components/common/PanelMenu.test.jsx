import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PanelMenu from './PanelMenu';

const renderMenu = (items, extra = {}) =>
  render(
    // A deliberately `overflow-hidden` wrapper — the raison d'être of this
    // component is that its menu must escape such a container via a portal.
    <div data-testid="clip-wrapper" style={{ overflow: 'hidden' }}>
      <PanelMenu testId="x" items={items} {...extra} />
    </div>
  );

describe('PanelMenu', () => {
  it('is closed initially; clicking the ⋮ trigger opens the menu', () => {
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: jest.fn() }]);
    expect(screen.queryByTestId('panel-menu-x')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    expect(screen.getByTestId('panel-menu-x')).toBeInTheDocument();
    expect(screen.getByTestId('panel-menu-item-rename-x')).toHaveTextContent('Rename');
  });

  it('portals the menu OUTSIDE the overflow-hidden wrapper (escapes the clip)', () => {
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: jest.fn() }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    const wrapper = screen.getByTestId('clip-wrapper');
    const menu = screen.getByTestId('panel-menu-x');
    expect(wrapper.contains(menu)).toBe(false);
  });

  it('selecting an item fires onSelect and closes the menu', () => {
    const onSelect = jest.fn();
    renderMenu([{ id: 'rename', label: 'Rename', onSelect }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    fireEvent.click(screen.getByTestId('panel-menu-item-rename-x'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('panel-menu-x')).not.toBeInTheDocument();
  });

  it('a disabled item is inert (no onSelect, stays open is irrelevant — it never fires)', () => {
    const onSelect = jest.fn();
    renderMenu([{ id: 'rename', label: 'Rename', onSelect, disabled: true }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    const item = screen.getByTestId('panel-menu-item-rename-x');
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a destructive item gets the highlight (red) treatment', () => {
    renderMenu([{ id: 'delete', label: 'Delete', onSelect: jest.fn(), destructive: true }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    expect(screen.getByTestId('panel-menu-item-delete-x').className).toContain('text-highlight-600');
  });

  it('Escape closes the menu', () => {
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: jest.fn() }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    expect(screen.getByTestId('panel-menu-x')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('panel-menu-x')).not.toBeInTheDocument();
  });

  it('clicking the backdrop closes the menu', () => {
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: jest.fn() }]);
    fireEvent.click(screen.getByTestId('panel-menu-trigger-x'));
    expect(screen.getByTestId('panel-menu-x')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('panel-menu-backdrop-x'));
    expect(screen.queryByTestId('panel-menu-x')).not.toBeInTheDocument();
  });
});
