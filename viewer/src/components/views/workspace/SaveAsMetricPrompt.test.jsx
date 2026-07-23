import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SaveAsMetricPrompt from './SaveAsMetricPrompt';

describe('SaveAsMetricPrompt', () => {
  test('pre-fills the suggested name', () => {
    render(<SaveAsMetricPrompt suggestedName="orders_q_amount_sum" onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('save-as-metric-name-input')).toHaveValue('orders_q_amount_sum');
  });

  test('submitting calls onSubmit with the (possibly edited) name', () => {
    const onSubmit = jest.fn();
    render(<SaveAsMetricPrompt suggestedName="orders_q_amount_sum" onSubmit={onSubmit} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByTestId('save-as-metric-name-input'), { target: { value: 'total_revenue' } });
    fireEvent.click(screen.getByTestId('save-as-metric-submit'));
    expect(onSubmit).toHaveBeenCalledWith('total_revenue');
  });

  test('Cancel calls onCancel without submitting', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    render(<SaveAsMetricPrompt suggestedName="x" onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('save-as-metric-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('shows an inline error and stays editable (never loses the flow)', () => {
    render(
      <SaveAsMetricPrompt
        suggestedName="total_revenue"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        error='A metric named "total_revenue" already exists — choose another name.'
      />
    );
    expect(screen.getByTestId('save-as-metric-error')).toHaveTextContent('already exists');
    expect(screen.getByTestId('save-as-metric-name-input')).not.toBeDisabled();
  });

  test('submit is disabled while submitting, with a "Saving…" label', () => {
    render(
      <SaveAsMetricPrompt suggestedName="x" onSubmit={jest.fn()} onCancel={jest.fn()} submitting />
    );
    expect(screen.getByTestId('save-as-metric-submit')).toBeDisabled();
    expect(screen.getByTestId('save-as-metric-submit')).toHaveTextContent('Saving…');
  });

  test('submit is disabled when the name is blank', () => {
    render(<SaveAsMetricPrompt suggestedName="x" onSubmit={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByTestId('save-as-metric-name-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('save-as-metric-submit')).toBeDisabled();
  });
});
