/**
 * RowTemplateMenu tests (VIS-794 / Track D D-7).
 *
 * The popup template picker rendered by the canvas "+ Add Row" affordances.
 * Pointer geometry (anchoring above/below the trigger) is exercised by the
 * Playwright story; here we lock the menu's contract: it lists the five
 * templates, selecting one calls back with the template key, and Escape
 * dismisses.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RowTemplateMenu from './RowTemplateMenu';
import { ROW_TEMPLATES } from './canvasReorder';

describe('RowTemplateMenu', () => {
  test('renders all five templates with their names', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('row-template-menu')).toBeInTheDocument();
    ROW_TEMPLATES.forEach(t => {
      expect(screen.getByTestId(`row-template-${t.key}`)).toBeInTheDocument();
      expect(screen.getByText(t.name)).toBeInTheDocument();
    });
  });

  test('clicking a template calls onSelect with its key', () => {
    const onSelect = jest.fn();
    render(<RowTemplateMenu onSelect={onSelect} onDismiss={jest.fn()} />);
    fireEvent.click(screen.getByTestId('row-template-2up'));
    expect(onSelect).toHaveBeenCalledWith('2up');
  });

  test('Escape calls onDismiss', () => {
    const onDismiss = jest.fn();
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={onDismiss} />);
    fireEvent.keyDown(screen.getByTestId('row-template-menu'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalled();
  });

  test('ArrowDown moves focus to the next template', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={jest.fn()} />);
    const menu = screen.getByTestId('row-template-menu');
    // First template is auto-focused on mount.
    expect(screen.getByTestId('row-template-blank')).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByTestId('row-template-kpi')).toHaveFocus();
  });

  test('the menu carries the menu role for a11y', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByRole('menu', { name: /insert row/i })).toBeInTheDocument();
  });
});
