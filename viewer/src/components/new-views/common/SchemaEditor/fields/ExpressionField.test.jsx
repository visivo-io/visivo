/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpressionField } from './ExpressionField';

describe('ExpressionField', () => {
  test('renders without crashing', () => {
    render(
      <ExpressionField value="" onChange={() => {}} label="Expression" description="Enter an expression" />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('displays the current value', () => {
    render(
      <ExpressionField value="${ref(insight.name).field}" onChange={() => {}} label="Expression" />
    );
    expect(screen.getByRole('textbox')).toHaveValue('${ref(insight.name).field}');
  });

  test('calls onChange with the typed value', () => {
    const onChange = jest.fn();
    render(<ExpressionField value="" onChange={onChange} label="Expression" />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '${ref(insight.my_insight).x}' },
    });
    expect(onChange).toHaveBeenCalledWith('${ref(insight.my_insight).x}');
  });

  test('calls onChange with undefined when cleared', () => {
    const onChange = jest.fn();
    render(
      <ExpressionField value="${ref(insight.name).field}" onChange={onChange} label="Expression" />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('shows placeholder text', () => {
    render(<ExpressionField value="" onChange={() => {}} label="Expression" />);
    expect(
      screen.getByPlaceholderText('${ref(insight.name).field}')
    ).toBeInTheDocument();
  });

  test('is disabled when disabled prop is true', () => {
    render(<ExpressionField value="" onChange={() => {}} label="Expression" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  test('treats undefined value as empty string', () => {
    render(<ExpressionField value={undefined} onChange={() => {}} label="Expression" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
