import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SQLTemplateMenu, { SQL_TEMPLATES } from './SQLTemplateMenu';

describe('SQLTemplateMenu', () => {
  it('renders the trigger button with default label', () => {
    render(<SQLTemplateMenu onPick={jest.fn()} />);
    expect(screen.getByTestId('sql-template-menu-trigger')).toHaveTextContent(
      'Use a SQL template'
    );
  });

  it('renders the trigger button with custom label', () => {
    render(<SQLTemplateMenu onPick={jest.fn()} label="Pick a starter" />);
    expect(screen.getByTestId('sql-template-menu-trigger')).toHaveTextContent('Pick a starter');
  });

  it('does not show the menu list until the trigger is clicked', () => {
    render(<SQLTemplateMenu onPick={jest.fn()} />);
    expect(screen.queryByTestId('sql-template-menu-list')).not.toBeInTheDocument();
  });

  it('opens the menu on click and renders all template labels', () => {
    render(<SQLTemplateMenu onPick={jest.fn()} />);
    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));

    expect(screen.getByTestId('sql-template-menu-list')).toBeInTheDocument();
    SQL_TEMPLATES.forEach((template) => {
      expect(screen.getByText(template.label)).toBeInTheDocument();
      expect(screen.getByText(template.description)).toBeInTheDocument();
    });
  });

  it('toggles the menu closed on second trigger click', () => {
    render(<SQLTemplateMenu onPick={jest.fn()} />);
    const trigger = screen.getByTestId('sql-template-menu-trigger');

    fireEvent.click(trigger);
    expect(screen.getByTestId('sql-template-menu-list')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('sql-template-menu-list')).not.toBeInTheDocument();
  });

  it('calls onPick with rendered SQL when a template is selected', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} currentTable="songs" />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    fireEvent.click(screen.getByTestId('sql-template-select-all'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('SELECT *\nFROM songs\nLIMIT 100;');
  });

  it('substitutes the current table for the count-by-category template', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} currentTable="orders" />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    fireEvent.click(screen.getByTestId('sql-template-count-by-category'));

    expect(onPick).toHaveBeenCalledWith(expect.stringContaining('FROM orders'));
    expect(onPick).toHaveBeenCalledWith(expect.stringContaining('GROUP BY category_column'));
  });

  it('falls back to your_table when currentTable is not provided', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    fireEvent.click(screen.getByTestId('sql-template-select-all'));

    expect(onPick).toHaveBeenCalledWith('SELECT *\nFROM your_table\nLIMIT 100;');
  });

  it('falls back to your_table when currentTable is null', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} currentTable={null} />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    fireEvent.click(screen.getByTestId('sql-template-distinct-values'));

    expect(onPick).toHaveBeenCalledWith(expect.stringContaining('FROM your_table'));
  });

  it('the join-two template ignores currentTable (it is a 2-table example)', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} currentTable="ignored" />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    fireEvent.click(screen.getByTestId('sql-template-join-two'));

    const arg = onPick.mock.calls[0][0];
    expect(arg).toContain('FROM table_a a');
    expect(arg).toContain('JOIN table_b b');
    expect(arg).not.toContain('ignored');
  });

  it('closes the menu after a template is picked', () => {
    const onPick = jest.fn();
    render(<SQLTemplateMenu onPick={onPick} />);

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    expect(screen.getByTestId('sql-template-menu-list')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sql-template-top-n'));
    expect(screen.queryByTestId('sql-template-menu-list')).not.toBeInTheDocument();
  });

  it('closes the menu on outside click', () => {
    const onPick = jest.fn();
    render(
      <div>
        <SQLTemplateMenu onPick={onPick} />
        <button data-testid="outside">Outside</button>
      </div>
    );

    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    expect(screen.getByTestId('sql-template-menu-list')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('sql-template-menu-list')).not.toBeInTheDocument();
  });

  it('does not throw when onPick is not provided', () => {
    render(<SQLTemplateMenu />);
    fireEvent.click(screen.getByTestId('sql-template-menu-trigger'));
    expect(() =>
      fireEvent.click(screen.getByTestId('sql-template-select-all'))
    ).not.toThrow();
  });

  it('exposes SQL_TEMPLATES with all six templates', () => {
    expect(SQL_TEMPLATES).toHaveLength(6);
    expect(SQL_TEMPLATES.map((t) => t.id)).toEqual([
      'select-all',
      'count-by-category',
      'sum-by-month',
      'top-n',
      'join-two',
      'distinct-values',
    ]);
  });
});
