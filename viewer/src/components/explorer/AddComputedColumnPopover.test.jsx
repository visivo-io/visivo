import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddComputedColumnPopover from './AddComputedColumnPopover';

describe('AddComputedColumnPopover', () => {
  let onAdd, onUpdate, onValidate, onEditClose;

  beforeEach(() => {
    jest.useFakeTimers();
    onAdd = jest.fn();
    onUpdate = jest.fn();
    onValidate = jest.fn().mockResolvedValue({ valid: true, detectedType: 'metric' });
    onEditClose = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderPopover = (props = {}) => {
    return render(
      <AddComputedColumnPopover
        onAdd={onAdd}
        onUpdate={onUpdate}
        onValidate={onValidate}
        existingNames={new Set()}
        onEditClose={onEditClose}
        {...props}
      />
    );
  };

  it('renders add button', () => {
    renderPopover();
    expect(screen.getByTestId('add-computed-column-btn')).toBeInTheDocument();
  });

  it('clicking add button opens popover', () => {
    renderPopover();

    expect(screen.queryByTestId('add-computed-column-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    expect(screen.getByTestId('add-computed-column-popover')).toBeInTheDocument();
  });

  it('shows name and expression inputs when open', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    expect(screen.getByTestId('computed-col-name')).toBeInTheDocument();
    expect(screen.getByTestId('computed-col-expression')).toBeInTheDocument();
  });

  it('submit button disabled when name or expression empty', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    const addBtn = screen.getByTestId('add-btn');
    expect(addBtn).toBeDisabled();

    // Fill name only
    fireEvent.change(screen.getByTestId('computed-col-name'), {
      target: { value: 'my_col' },
    });
    expect(addBtn).toBeDisabled();

    // Clear name, fill expression only
    fireEvent.change(screen.getByTestId('computed-col-name'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SUM(amount)' },
    });
    expect(addBtn).toBeDisabled();
  });

  it('calls onAdd with { name, expression, type } on valid submit', async () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    fireEvent.change(screen.getByTestId('computed-col-name'), {
      target: { value: 'total_revenue' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SUM(amount)' },
    });

    // Advance past debounce so validation runs
    await act(async () => {
      jest.advanceTimersByTime(750);
    });

    fireEvent.click(screen.getByTestId('add-btn'));

    expect(onAdd).toHaveBeenCalledWith({
      name: 'total_revenue',
      expression: 'SUM(amount)',
      type: 'metric',
    });
  });

  it('shows duplicate name error when name exists in existingNames Set', () => {
    renderPopover({ existingNames: new Set(['revenue']) });
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    fireEvent.change(screen.getByTestId('computed-col-name'), {
      target: { value: 'revenue' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SUM(amount)' },
    });

    fireEvent.click(screen.getByTestId('add-btn'));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('validation-result')).toHaveTextContent(
      'Column "revenue" already exists'
    );
  });

  it('edit mode: name field is disabled, pre-filled from editColumn prop', () => {
    const editColumn = { name: 'existing_col', expression: 'COUNT(*)', type: 'metric' };
    renderPopover({ editColumn });

    const nameInput = screen.getByTestId('computed-col-name');
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue('existing_col');

    const exprInput = screen.getByTestId('computed-col-expression');
    expect(exprInput).toHaveValue('COUNT(*)');
  });

  it('edit mode: calls onUpdate (not onAdd) on submit', () => {
    const editColumn = { name: 'existing_col', expression: 'COUNT(*)', type: 'metric' };
    renderPopover({ editColumn });

    // Change the expression
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SUM(price)' },
    });

    fireEvent.click(screen.getByTestId('save-btn'));

    expect(onUpdate).toHaveBeenCalledWith({
      name: 'existing_col',
      expression: 'SUM(price)',
      type: 'metric',
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('edit mode: cancel calls onEditClose', () => {
    const editColumn = { name: 'existing_col', expression: 'COUNT(*)', type: 'metric' };
    renderPopover({ editColumn });

    fireEvent.click(screen.getByTestId('cancel-btn'));

    expect(onEditClose).toHaveBeenCalled();
  });

  it('onValidate rejection shows error and clears spinner', async () => {
    const rejectingValidate = jest.fn().mockRejectedValue(new Error('Network error'));
    renderPopover({ onValidate: rejectingValidate });
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'BAD_EXPR' },
    });

    // Advance past debounce
    await act(async () => {
      jest.advanceTimersByTime(750);
    });

    // Validation should have been called and error shown
    await waitFor(() => {
      expect(screen.getByTestId('validation-result')).toHaveTextContent('Network error');
    });

    // Spinner should not be visible
    expect(screen.queryByTestId('validating-indicator')).not.toBeInTheDocument();
  });

  it('clicking outside closes popover', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    expect(screen.getByTestId('add-computed-column-popover')).toBeInTheDocument();

    // Simulate clicking outside the popover and button
    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('add-computed-column-popover')).not.toBeInTheDocument();
  });

  it('defaults type to dimension when detectedType is null', () => {
    onValidate.mockResolvedValue({ valid: true, detectedType: null });
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    fireEvent.change(screen.getByTestId('computed-col-name'), {
      target: { value: 'my_col' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'col_a' },
    });

    fireEvent.click(screen.getByTestId('add-btn'));

    expect(onAdd).toHaveBeenCalledWith({
      name: 'my_col',
      expression: 'col_a',
      type: 'dimension',
    });
  });

  it('close button (X) closes popover', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    expect(screen.getByTestId('add-computed-column-popover')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('popover-close'));

    expect(screen.queryByTestId('add-computed-column-popover')).not.toBeInTheDocument();
  });

  it('debounces validation calls', async () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('add-computed-column-btn'));

    // Type multiple times rapidly
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SU' },
    });
    fireEvent.change(screen.getByTestId('computed-col-expression'), {
      target: { value: 'SUM' },
    });

    // Before debounce expires, no validation should be called
    expect(onValidate).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      jest.advanceTimersByTime(750);
    });

    // Only one validation call with the final value
    expect(onValidate).toHaveBeenCalledTimes(1);
    expect(onValidate).toHaveBeenCalledWith('SUM');
  });
});
