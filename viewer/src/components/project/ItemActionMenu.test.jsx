/**
 * ItemActionMenu tests — the consolidated View-mode item-action kebab (⋮).
 *
 * The menu is CONTROLLED by the parent (ProjectViewFlipLayer owns `open` so the
 * kebab survives the slot-hover clearing as the cursor reaches it). These tests
 * cover both the controlled contract (open prop, onToggle/onClose/onHover) and
 * the end-to-end open→select→close flow via a small stateful harness.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PiLink, PiArrowsClockwise } from 'react-icons/pi';
import ItemActionMenu from './ItemActionMenu';

const BOX = { top: 0, left: 0, width: 200, height: 100 };
const KEY = 'row.0.item.0';

const DEFAULT_ACTIONS = onCopy => onFlip =>
  [
    { id: 'copy', label: 'Copy link', icon: PiLink, onSelect: onCopy },
    { id: 'flip', label: 'Flip to lineage', icon: PiArrowsClockwise, onSelect: onFlip },
  ];

// Stateful harness that mimics the parent owning `open` (toggle on click, close
// on onClose) so the open→select→close flows can be exercised end-to-end.
const ControlledMenu = ({ actions, box = BOX, onHover }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <ItemActionMenu
      box={box}
      itemKey={KEY}
      actions={actions}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onClose={() => setOpen(false)}
      onHover={onHover}
    />
  );
};

const renderControlled = (overrides = {}) => {
  const onCopy = jest.fn();
  const onFlip = jest.fn();
  const actions = overrides.actions || DEFAULT_ACTIONS(onCopy)(onFlip);
  render(<ControlledMenu actions={actions} onHover={overrides.onHover} box={overrides.box} />);
  return { onCopy, onFlip };
};

const kebab = () => screen.getByTestId(`view-item-menu-${KEY}`);
const list = () => screen.queryByTestId(`view-item-menu-list-${KEY}`);
const action = id => screen.getByTestId(`view-item-action-${id}-${KEY}`);

describe('ItemActionMenu', () => {
  test('renders nothing without a box', () => {
    const { container } = render(
      <ItemActionMenu box={null} itemKey={KEY} actions={[]} open={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('kebab present, menu closed at rest', () => {
    renderControlled();
    expect(kebab()).toBeInTheDocument();
    expect(list()).not.toBeInTheDocument();
  });

  test('controlled: list renders only when open=true', () => {
    const { rerender } = render(
      <ItemActionMenu box={BOX} itemKey={KEY} actions={DEFAULT_ACTIONS(jest.fn())(jest.fn())} open={false} />
    );
    expect(list()).not.toBeInTheDocument();
    rerender(
      <ItemActionMenu box={BOX} itemKey={KEY} actions={DEFAULT_ACTIONS(jest.fn())(jest.fn())} open={true} />
    );
    expect(list()).toBeInTheDocument();
  });

  test('clicking the kebab calls onToggle', () => {
    const onToggle = jest.fn();
    render(<ItemActionMenu box={BOX} itemKey={KEY} actions={[]} open={false} onToggle={onToggle} />);
    fireEvent.click(kebab());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('clicking the kebab opens the action list (end-to-end)', () => {
    renderControlled();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    expect(action('copy')).toHaveTextContent('Copy link');
    expect(action('flip')).toHaveTextContent('Flip to lineage');
  });

  test('selecting an action invokes onSelect and closes the menu', () => {
    const { onCopy } = renderControlled();
    fireEvent.click(kebab());
    fireEvent.click(action('copy'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(list()).not.toBeInTheDocument();
  });

  test('keepOpen actions do not close the menu', () => {
    const onSelect = jest.fn();
    renderControlled({ actions: [{ id: 'noop', label: 'Stay', onSelect, keepOpen: true }] });
    fireEvent.click(kebab());
    fireEvent.click(action('noop'));
    expect(onSelect).toHaveBeenCalled();
    expect(list()).toBeInTheDocument();
  });

  test('active action renders in the mulberry tone', () => {
    render(
      <ItemActionMenu
        box={BOX}
        itemKey={KEY}
        open={true}
        actions={[{ id: 'flip', label: 'Hide lineage', active: true, onSelect: jest.fn() }]}
      />
    );
    expect(action('flip')).toHaveStyle({ color: '#713b57' });
  });

  test('closes on Escape', () => {
    renderControlled();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(list()).not.toBeInTheDocument();
  });

  test('closes on outside click', () => {
    renderControlled();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(list()).not.toBeInTheDocument();
  });

  test('clicking inside the menu does NOT close it (mousedown swallowed)', () => {
    renderControlled();
    fireEvent.click(kebab());
    fireEvent.mouseDown(list());
    expect(list()).toBeInTheDocument();
  });

  test('reports hover via onHover on pointer enter/leave', () => {
    const onHover = jest.fn();
    renderControlled({ onHover });
    const container = screen.getByTestId(`view-item-menu-wrap-${KEY}`);
    fireEvent.pointerEnter(container);
    expect(onHover).toHaveBeenLastCalledWith(true);
    fireEvent.pointerLeave(container);
    expect(onHover).toHaveBeenLastCalledWith(false);
  });

  test('aria-expanded reflects open state', () => {
    renderControlled();
    expect(kebab()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(kebab());
    expect(kebab()).toHaveAttribute('aria-expanded', 'true');
  });
});
