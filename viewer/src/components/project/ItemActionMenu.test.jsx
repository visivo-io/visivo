/**
 * ItemActionMenu tests — the consolidated View-mode item-action kebab (⋮).
 *
 * Locks: closed-at-rest, opens on click, renders the data-driven action list,
 * invokes onSelect + closes, the `active` tone, `keepOpen`, and close on
 * outside-click / Escape.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PiLink, PiArrowsClockwise } from 'react-icons/pi';
import ItemActionMenu from './ItemActionMenu';

const BOX = { top: 0, left: 0, width: 200, height: 100 };
const KEY = 'row.0.item.0';

const renderMenu = (overrides = {}) => {
  const onCopy = jest.fn();
  const onFlip = jest.fn();
  const actions = overrides.actions || [
    { id: 'copy', label: 'Copy link', icon: PiLink, onSelect: onCopy },
    { id: 'flip', label: 'Flip to lineage', icon: PiArrowsClockwise, onSelect: onFlip },
  ];
  render(<ItemActionMenu box={BOX} itemKey={KEY} actions={actions} {...overrides} />);
  return { onCopy, onFlip };
};

const kebab = () => screen.getByTestId(`view-item-menu-${KEY}`);
const list = () => screen.queryByTestId(`view-item-menu-list-${KEY}`);
const action = id => screen.getByTestId(`view-item-action-${id}-${KEY}`);

describe('ItemActionMenu', () => {
  test('renders nothing without a box', () => {
    const { container } = render(<ItemActionMenu box={null} itemKey={KEY} actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('kebab present, menu closed at rest', () => {
    renderMenu();
    expect(kebab()).toBeInTheDocument();
    expect(list()).not.toBeInTheDocument();
  });

  test('clicking the kebab opens the action list', () => {
    renderMenu();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    expect(action('copy')).toHaveTextContent('Copy link');
    expect(action('flip')).toHaveTextContent('Flip to lineage');
  });

  test('selecting an action invokes onSelect and closes the menu', () => {
    const { onCopy } = renderMenu();
    fireEvent.click(kebab());
    fireEvent.click(action('copy'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(list()).not.toBeInTheDocument();
  });

  test('keepOpen actions do not close the menu', () => {
    const onSelect = jest.fn();
    renderMenu({
      actions: [{ id: 'noop', label: 'Stay', onSelect, keepOpen: true }],
    });
    fireEvent.click(kebab());
    fireEvent.click(action('noop'));
    expect(onSelect).toHaveBeenCalled();
    expect(list()).toBeInTheDocument();
  });

  test('active action renders in the mulberry tone', () => {
    renderMenu({
      actions: [{ id: 'flip', label: 'Hide lineage', active: true, onSelect: jest.fn() }],
    });
    fireEvent.click(kebab());
    expect(action('flip')).toHaveStyle({ color: '#713b57' });
  });

  test('closes on Escape', () => {
    renderMenu();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(list()).not.toBeInTheDocument();
  });

  test('closes on outside click', () => {
    renderMenu();
    fireEvent.click(kebab());
    expect(list()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(list()).not.toBeInTheDocument();
  });

  test('aria-expanded reflects open state', () => {
    renderMenu();
    expect(kebab()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(kebab());
    expect(kebab()).toHaveAttribute('aria-expanded', 'true');
  });
});
