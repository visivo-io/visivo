/**
 * OpenObjectContextMenu (VIS-811 / Track O O-2).
 *
 * The shared right-click "Open / Open in new tab" menu used by lineage nodes
 * and Project Editor tiles. These tests pin the action wiring, the dismiss
 * contract (outside pointer / Escape / scroll), and the event-bubbling guard
 * (portal clicks must not reach the host element's onClick).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OpenObjectContextMenu from './OpenObjectContextMenu';

const OBJ = { type: 'chart', name: 'revenue_chart' };

const renderMenu = (props = {}) =>
  render(
    <OpenObjectContextMenu
      x={120}
      y={80}
      obj={OBJ}
      testIdPrefix="test-ctx"
      {...props}
    />
  );

describe('OpenObjectContextMenu', () => {
  test('renders the object name header and both actions at the given position', () => {
    renderMenu();
    const menu = screen.getByTestId('test-ctx-menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ top: '80px', left: '120px' });
    expect(screen.getByText('revenue_chart')).toBeInTheDocument();
    expect(screen.getByTestId('test-ctx-open')).toHaveTextContent('Open');
    expect(screen.getByTestId('test-ctx-open-new-tab')).toHaveTextContent('Open in new tab');
  });

  test('renders nothing without an object', () => {
    render(<OpenObjectContextMenu x={0} y={0} obj={null} testIdPrefix="test-ctx" />);
    expect(screen.queryByTestId('test-ctx-menu')).not.toBeInTheDocument();
  });

  test('"Open" calls onOpen with the object, then dismisses', () => {
    const onOpen = jest.fn();
    const onDismiss = jest.fn();
    renderMenu({ onOpen, onDismiss });
    fireEvent.click(screen.getByTestId('test-ctx-open'));
    expect(onOpen).toHaveBeenCalledWith(OBJ);
    expect(onDismiss).toHaveBeenCalled();
  });

  test('"Open in new tab" calls onOpenInNewTab with the object, then dismisses', () => {
    const onOpenInNewTab = jest.fn();
    const onDismiss = jest.fn();
    renderMenu({ onOpenInNewTab, onDismiss });
    fireEvent.click(screen.getByTestId('test-ctx-open-new-tab'));
    expect(onOpenInNewTab).toHaveBeenCalledWith(OBJ);
    expect(onDismiss).toHaveBeenCalled();
  });

  test('dismisses on Escape and on outside pointer-down, but not on inside pointer-down', () => {
    const onDismiss = jest.fn();
    renderMenu({ onDismiss });

    fireEvent.pointerDown(screen.getByTestId('test-ctx-open'));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  test('dismisses on scroll', () => {
    const onDismiss = jest.fn();
    renderMenu({ onDismiss });
    fireEvent.scroll(window);
    expect(onDismiss).toHaveBeenCalled();
  });

  test('menu clicks do not bubble to the host element (portal guard)', () => {
    const hostClick = jest.fn();
    render(
      <div onClick={hostClick}>
        <OpenObjectContextMenu
          x={0}
          y={0}
          obj={OBJ}
          onOpen={jest.fn()}
          testIdPrefix="test-ctx"
        />
      </div>
    );
    fireEvent.click(screen.getByTestId('test-ctx-open'));
    expect(hostClick).not.toHaveBeenCalled();
  });
});
