import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LevelGroupHeader from './LevelGroupHeader';

/**
 * LevelGroupHeader inline affordances (VIS-807 M-2a).
 *
 * Pins the double-click-to-rename (Enter commits / Esc cancels), reorder
 * up/down, and delete-with-confirm affordances. The synthetic Unassigned
 * bucket renders read-only (`editable={false}`).
 */
const baseProps = {
  title: 'Organization',
  count: 3,
  collapsed: false,
  onToggle: jest.fn(),
  testId: 'lgh',
  editable: true,
  canMoveUp: true,
  canMoveDown: true,
};

describe('LevelGroupHeader', () => {
  test('renders title and count', () => {
    render(<LevelGroupHeader {...baseProps} />);
    expect(screen.getByTestId('lgh-title')).toHaveTextContent('Organization');
    expect(screen.getByText(/3 dashboards/)).toBeInTheDocument();
  });

  test('non-editable group hides the action affordances', () => {
    render(<LevelGroupHeader {...baseProps} editable={false} />);
    expect(screen.queryByTestId('lgh-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lgh-delete')).not.toBeInTheDocument();
  });

  test('double-click commits a rename on Enter', () => {
    const onRename = jest.fn();
    render(<LevelGroupHeader {...baseProps} onRename={onRename} />);
    fireEvent.doubleClick(screen.getByTestId('lgh-title'));
    const input = screen.getByTestId('lgh-rename-input');
    fireEvent.change(input, { target: { value: 'Company' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Company');
  });

  test('Escape cancels a rename without firing onRename', () => {
    const onRename = jest.fn();
    render(<LevelGroupHeader {...baseProps} onRename={onRename} />);
    fireEvent.doubleClick(screen.getByTestId('lgh-title'));
    const input = screen.getByTestId('lgh-rename-input');
    fireEvent.change(input, { target: { value: 'Company' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByTestId('lgh-title')).toHaveTextContent('Organization');
  });

  test('reorder up/down invoke their handlers and respect disabled bounds', () => {
    const onMoveUp = jest.fn();
    const onMoveDown = jest.fn();
    const { rerender } = render(
      <LevelGroupHeader {...baseProps} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
    );
    fireEvent.click(screen.getByTestId('lgh-move-up'));
    fireEvent.click(screen.getByTestId('lgh-move-down'));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);

    rerender(
      <LevelGroupHeader
        {...baseProps}
        canMoveUp={false}
        canMoveDown={false}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
    expect(screen.getByTestId('lgh-move-up')).toBeDisabled();
    expect(screen.getByTestId('lgh-move-down')).toBeDisabled();
  });

  test('delete asks for confirmation before invoking onDelete', () => {
    const onDelete = jest.fn();
    render(<LevelGroupHeader {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('lgh-delete'));
    expect(screen.getByTestId('lgh-delete-confirm')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('lgh-delete-confirm-btn'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('delete confirm can be cancelled', () => {
    const onDelete = jest.fn();
    render(<LevelGroupHeader {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('lgh-delete'));
    fireEvent.click(screen.getByTestId('lgh-delete-cancel'));
    expect(screen.queryByTestId('lgh-delete-confirm')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
