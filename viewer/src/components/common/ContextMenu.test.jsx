import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContextMenu from './ContextMenu';

describe('ContextMenu', () => {
  it('renders children at the given coordinates', () => {
    render(
      <ContextMenu x={100} y={200} onClose={() => {}}>
        <button>Hello</button>
      </ContextMenu>
    );

    const menu = screen.getByTestId('context-menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ top: '200px', left: '100px' });
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls onClose when clicking outside the menu', () => {
    const onClose = jest.fn();
    render(
      <ContextMenu x={0} y={0} onClose={onClose}>
        <button>Item</button>
      </ContextMenu>
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicking inside the menu', () => {
    const onClose = jest.fn();
    render(
      <ContextMenu x={0} y={0} onClose={onClose}>
        <button>Item</button>
      </ContextMenu>
    );

    fireEvent.mouseDown(screen.getByText('Item'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape', () => {
    const onClose = jest.fn();
    render(
      <ContextMenu x={0} y={0} onClose={onClose}>
        <button>Item</button>
      </ContextMenu>
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
