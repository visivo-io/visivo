/**
 * LevelEditForm tests (VIS-807 / Track M M-2b).
 *
 * The right-rail Edit-tab form for a dashboard Level. Verifies it resolves the
 * level by index, seeds its fields, persists title + description through the
 * store's `updateLevel`, and delegates reorder / delete to the existing M-2a
 * store actions (it does not rebuild their UI).
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import LevelEditForm from './LevelEditForm';
import useStore from '../../../stores/store';

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      defaults: {
        levels: [
          { title: 'Organization', description: 'org desc' },
          { title: 'Team', description: 'team desc' },
          { title: 'Individual', description: 'ind desc' },
        ],
      },
      fetchDefaults: jest.fn(),
      updateLevel: jest.fn(async () => ({ success: true })),
      reorderLevel: jest.fn(async () => ({ success: true })),
      deleteLevel: jest.fn(async () => ({ success: true })),
      ...overrides,
    });
  });
};

describe('LevelEditForm', () => {
  test('seeds title + description from the resolved level and shows a chip', () => {
    seed();
    render(<LevelEditForm index={1} />);
    expect(screen.getByTestId('right-rail-edit-level')).toBeInTheDocument();
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveTextContent('Team');
    expect(screen.getByTestId('level-edit-title')).toHaveValue('Team');
    expect(screen.getByTestId('level-edit-description')).toHaveValue('team desc');
  });

  test('Save persists title + description via updateLevel', async () => {
    const updateLevel = jest.fn(async () => ({ success: true }));
    seed({ updateLevel });
    render(<LevelEditForm index={0} />);

    fireEvent.change(screen.getByTestId('level-edit-title'), { target: { value: 'Company' } });
    fireEvent.change(screen.getByTestId('level-edit-description'), { target: { value: 'new' } });
    fireEvent.click(screen.getByTestId('level-edit-save'));

    await waitFor(() => expect(updateLevel).toHaveBeenCalledTimes(1));
    expect(updateLevel).toHaveBeenCalledWith(0, { title: 'Company', description: 'new' });
  });

  test('blocks save and surfaces an error when the title is blank', async () => {
    const updateLevel = jest.fn(async () => ({ success: true }));
    seed({ updateLevel });
    render(<LevelEditForm index={0} />);

    fireEvent.change(screen.getByTestId('level-edit-title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('level-edit-save'));

    await screen.findByText('Title is required.');
    expect(updateLevel).not.toHaveBeenCalled();
  });

  test('reorder buttons call reorderLevel; disabled at the boundaries', () => {
    const reorderLevel = jest.fn();
    seed({ reorderLevel });
    render(<LevelEditForm index={0} />);
    // index 0 → cannot move up.
    expect(screen.getByTestId('level-edit-move-up')).toBeDisabled();
    fireEvent.click(screen.getByTestId('level-edit-move-down'));
    expect(reorderLevel).toHaveBeenCalledWith(0, 1);
  });

  test('delete confirms then calls deleteLevel', async () => {
    const deleteLevel = jest.fn(async () => ({ success: true }));
    seed({ deleteLevel });
    render(<LevelEditForm index={2} />);

    fireEvent.click(screen.getByTestId('level-edit-delete'));
    expect(screen.getByTestId('level-edit-delete-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('level-edit-delete-confirm-btn'));
    await waitFor(() => expect(deleteLevel).toHaveBeenCalledWith(2));
  });

  test('renders a "no longer exists" state for an out-of-range index', () => {
    seed();
    render(<LevelEditForm index={9} />);
    expect(screen.getByTestId('right-rail-edit-level-missing')).toBeInTheDocument();
  });
});
