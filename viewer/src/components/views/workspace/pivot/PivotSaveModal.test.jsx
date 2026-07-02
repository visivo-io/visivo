/**
 * PivotSaveModal — the pivot Build-lens Save choice (replace vs add-new).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PivotSaveModal from './PivotSaveModal';

const noop = () => {};

describe('PivotSaveModal', () => {
  test('renders nothing when closed', () => {
    render(
      <PivotSaveModal
        open={false}
        tableName="sales-pivot-table"
        onReplace={noop}
        onAddNew={noop}
        onCancel={noop}
      />
    );
    expect(screen.queryByTestId('pivot-save-modal')).not.toBeInTheDocument();
  });

  test('shows replace + add-new actions and the table name when open', () => {
    render(
      <PivotSaveModal
        open
        tableName="sales-pivot-table"
        onReplace={noop}
        onAddNew={noop}
        onCancel={noop}
      />
    );
    expect(screen.getByTestId('pivot-save-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pivot-save-replace')).toHaveTextContent('sales-pivot-table');
    expect(screen.getByTestId('pivot-save-add-new')).toBeInTheDocument();
  });

  test('fires onReplace and onAddNew', () => {
    const onReplace = jest.fn();
    const onAddNew = jest.fn();
    render(
      <PivotSaveModal
        open
        tableName="t"
        onReplace={onReplace}
        onAddNew={onAddNew}
        onCancel={noop}
      />
    );
    fireEvent.click(screen.getByTestId('pivot-save-replace'));
    expect(onReplace).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('pivot-save-add-new'));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });

  test('cancels on backdrop click, Cancel button, and Escape', () => {
    const onCancel = jest.fn();
    render(
      <PivotSaveModal open tableName="t" onReplace={noop} onAddNew={noop} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('pivot-save-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByTestId('pivot-save-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  test('renders a failed save error when the error prop is set', () => {
    const { rerender } = render(
      <PivotSaveModal open tableName="t" onReplace={noop} onAddNew={noop} onCancel={noop} />
    );
    expect(screen.queryByTestId('pivot-save-error')).not.toBeInTheDocument();

    rerender(
      <PivotSaveModal
        open
        tableName="t"
        error="boom"
        onReplace={noop}
        onAddNew={noop}
        onCancel={noop}
      />
    );
    expect(screen.getByTestId('pivot-save-error')).toHaveTextContent('boom');
  });

  test('disables the action buttons while saving', () => {
    render(
      <PivotSaveModal
        open
        saving
        tableName="t"
        onReplace={noop}
        onAddNew={noop}
        onCancel={noop}
      />
    );
    expect(screen.getByTestId('pivot-save-replace')).toBeDisabled();
    expect(screen.getByTestId('pivot-save-add-new')).toBeDisabled();
  });
});
