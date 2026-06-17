/**
 * ConfirmDialog + useConfirm — the brand replacement for window.confirm().
 * Verifies the imperative promise resolves true on confirm / false on cancel,
 * that danger styling is applied, and that the dialog only renders when open.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmDialog, { useConfirm } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  test('does not render when closed', () => {
    render(<ConfirmDialog open={false} title="Nope" />);
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  test('renders title + body when open', () => {
    render(<ConfirmDialog open title="Reset?" body="Clears your edits." />);
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Reset?');
    expect(screen.getByText('Clears your edits.')).toBeInTheDocument();
  });

  test('danger action uses the highlight (destructive) styling', () => {
    render(<ConfirmDialog open title="Delete" danger confirmLabel="Delete" />);
    expect(screen.getByTestId('confirm-dialog-confirm').className).toMatch(/bg-highlight/);
  });

  test('non-danger action uses the primary styling', () => {
    render(<ConfirmDialog open title="Save" confirmLabel="Save" />);
    expect(screen.getByTestId('confirm-dialog-confirm').className).toMatch(/bg-primary/);
  });

  test('confirm + cancel fire their callbacks', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog open title="x" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

// Harness exercising the imperative hook end-to-end.
function Harness({ onResult }) {
  const { confirm, ConfirmDialog: dialog } = useConfirm();
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Reset the layout?',
            body: 'This clears your moved cards and edges.',
            confirmLabel: 'Reset',
            danger: true,
          });
          onResult(ok);
        }}
      >
        open
      </button>
      {dialog}
    </div>
  );
}

describe('useConfirm', () => {
  test('resolves true when the user confirms', async () => {
    const onResult = jest.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Reset the layout?');
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    // Dialog closes after resolving.
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  test('resolves false when the user cancels', async () => {
    const onResult = jest.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
