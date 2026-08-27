/* eslint-disable no-template-curly-in-string -- fixtures use literal `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExpressionField from './ExpressionField';

// RefTextArea is a contentEditable pill editor; these tests care only about
// WHICH editor is chosen and what it is told, not how it renders internally.
jest.mock('./RefTextArea', () => {
  return function MockRefTextArea({ value, onChange, allowedTypes, acceptDrops, label }) {
    return (
      <div
        data-testid="ref-text-area"
        data-allowed-types={(allowedTypes || []).join(',')}
        data-accept-drops={acceptDrops ? 'true' : 'false'}
      >
        <span>{label}</span>
        <input value={value || ''} onChange={e => onChange(e.target.value)} data-testid="ref-input" />
      </div>
    );
  };
});

describe('ExpressionField — the editor comes from the declared field type', () => {
  test('a context-sql field renders the ref editor, scoped to its own vocabulary', () => {
    render(
      <ExpressionField objectType="relation" field="condition" value="" onChange={jest.fn()} />
    );
    const editor = screen.getByTestId('ref-text-area');
    // Models only — a metric ref is an aggregate, not a join key.
    expect(editor).toHaveAttribute('data-allowed-types', 'model');
    expect(editor).toHaveAttribute('data-accept-drops', 'true');
  });

  test('a different context-sql field gets a different vocabulary from the same component', () => {
    render(<ExpressionField objectType="metric" field="expression" value="" onChange={jest.fn()} />);
    expect(screen.getByTestId('ref-text-area').getAttribute('data-allowed-types')).toContain(
      'metric'
    );
  });

  test('the SAME field nested under a model becomes a plain textarea', () => {
    const { rerender } = render(
      <ExpressionField objectType="metric" field="expression" value="" onChange={jest.fn()} />
    );
    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();

    rerender(
      <ExpressionField objectType="metric" field="expression" nested value="" onChange={jest.fn()} />
    );
    // `sql_model.py` rejects any ref in a nested expression, so there must be
    // no ref affordance at all — not merely an empty menu.
    expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('plain-sql-input')).toBeInTheDocument();
  });

  test('a plain-sql field edits as text', () => {
    const onChange = jest.fn();
    render(
      <ExpressionField
        objectType="dimension"
        field="expression"
        nested
        value="date_trunc(day, ts)"
        onChange={onChange}
      />
    );
    const input = screen.getByTestId('plain-sql-input');
    expect(input).toHaveValue('date_trunc(day, ts)');
    fireEvent.change(input, { target: { value: 'lower(name)' } });
    expect(onChange).toHaveBeenCalledWith('lower(name)');
  });

  test('a ref pasted into a ref-free field is flagged while typing, not at save', () => {
    render(
      <ExpressionField
        objectType="metric"
        field="expression"
        nested
        value="sum(${ref(orders).amount})"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('plain-sql-ref-warning')).toBeInTheDocument();
  });

  test('a clean plain-sql value shows its helper text, not a warning', () => {
    render(
      <ExpressionField
        objectType="metric"
        field="expression"
        nested
        value="SUM(amount)"
        onChange={jest.fn()}
        helperText="Plain SQL over the parent model."
      />
    );
    expect(screen.queryByTestId('plain-sql-ref-warning')).not.toBeInTheDocument();
    expect(screen.getByText('Plain SQL over the parent model.')).toBeInTheDocument();
  });

  test('an undeclared field fails loudly rather than guessing an editor', () => {
    // Silence React's error-boundary logging for the expected throw.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<ExpressionField objectType="relation" field="join_type" value="" onChange={jest.fn()} />)
    ).toThrow(/no declared field type/);
    spy.mockRestore();
  });

  test('a query-string field names the component that still owns it', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<ExpressionField objectType="insight" field="x" value="" onChange={jest.fn()} />)
    ).toThrow(/PropertyRow/);
    spy.mockRestore();
  });

  // A dimension can be model-scoped or standalone, and the Library lists both in
  // one flat DIMENSIONS section — so a user has no way to tell which they're
  // editing. Naming the model makes the classification checkable at a glance
  // instead of only by reading the YAML.
  test('the ref-free warning names the model it is scoped to', () => {
    render(
      <ExpressionField
        objectType="dimension"
        field="expression"
        nested
        scopedToModel="new-model"
        value="${ref(new-model)}"
        onChange={jest.fn()}
      />
    );
    const warning = screen.getByTestId('plain-sql-ref-warning');
    expect(warning).toHaveTextContent('Scoped to');
    expect(warning).toHaveTextContent('new-model');
  });

  test('falls back to generic copy when the model is unknown', () => {
    render(
      <ExpressionField
        objectType="dimension"
        field="expression"
        nested
        value="${ref(x)}"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('plain-sql-ref-warning')).toHaveTextContent(
      /References aren't available/
    );
  });

});
