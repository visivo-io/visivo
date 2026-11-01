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

  test('Escape pressed outside the menu also dismisses it', () => {
    const onDismiss = jest.fn();
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('Escape returns focus to the element focused when the menu opened', () => {
    const Harness = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            Add row
          </button>
          {open && <RowTemplateMenu onSelect={jest.fn()} onDismiss={() => setOpen(false)} />}
        </>
      );
    };
    render(<Harness />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('row-template-blank')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('row-template-blank'), { key: 'Escape' });
    expect(screen.queryByTestId('row-template-menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('Escape works without an onDismiss callback', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} />);
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
  });

  test('ArrowUp moves focus back and stops at the first template', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={jest.fn()} />);
    const menu = screen.getByTestId('row-template-menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByTestId('row-template-blank')).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByTestId('row-template-blank')).toHaveFocus();
  });

  test('hovering a template highlights it until the pointer leaves', () => {
    render(<RowTemplateMenu onSelect={jest.fn()} onDismiss={jest.fn()} />);
    const item = screen.getByTestId('row-template-kpi');
    fireEvent.mouseEnter(item);
    expect(item.className).toContain('bg-gray-100');
    fireEvent.mouseLeave(item);
    expect(item.className).not.toContain('bg-gray-100');
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
