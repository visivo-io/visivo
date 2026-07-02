/**
 * ErdTidyButton (§6) — the "Tidy layout" ERD toolbar action.
 *
 * A pristine canvas tidies immediately; a canvas with moved cards shows the
 * "edited" dot and asks for confirmation before clearing the layout (Reset is a
 * destructive action — it drops the user's hand-placed positions).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErdTidyButton from './ErdTidyButton';

describe('ErdTidyButton', () => {
  test('pristine layout: no edited dot, click tidies immediately without confirmation', () => {
    const onTidy = jest.fn();
    render(<ErdTidyButton onTidy={onTidy} hasEdits={false} testId="erd-tidy" />);

    expect(screen.queryByTestId('erd-tidy-edited-dot')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('erd-tidy'));
    expect(onTidy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  test('edited layout: shows the edited dot and confirms before tidying', async () => {
    const onTidy = jest.fn();
    render(<ErdTidyButton onTidy={onTidy} hasEdits testId="erd-tidy" />);

    expect(screen.getByTestId('erd-tidy-edited-dot')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('erd-tidy'));
    // The reset is destructive → the confirm dialog fronts it.
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('Reset the layout?');
    expect(onTidy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(onTidy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  test('cancelling the confirmation keeps the layout (no tidy)', async () => {
    const onTidy = jest.fn();
    render(<ErdTidyButton onTidy={onTidy} hasEdits testId="erd-tidy" />);

    fireEvent.click(screen.getByTestId('erd-tidy'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    );
    expect(onTidy).not.toHaveBeenCalled();
  });
});
