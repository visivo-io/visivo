/* eslint-disable no-template-curly-in-string -- fixtures use literal `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExpressionField from './ExpressionField';

// RefTextArea is a contentEditable pill editor; these tests care only about
// WHICH editor is chosen and what it is told, not how it renders internally.
jest.mock('./RefTextArea', () => {
  return function MockRefTextArea({
    value,
    onChange,
    allowedTypes,
    acceptDrops,
    configurableChips,
    label,
  }) {
    return (
      <div
        data-testid="ref-text-area"
        data-allowed-types={(allowedTypes || []).join(',')}
        data-accept-drops={acceptDrops ? 'true' : 'false'}
        data-configurable-chips={configurableChips ? 'true' : 'false'}
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

  // VIS-1327 regression: query-string used to throw here instead of matching
  // context-sql's affordances.
  test('a query-string field renders the same ref-capable editor as context-sql', () => {
    render(<ExpressionField objectType="insight" field="x" value="" onChange={jest.fn()} />);

    const editor = screen.getByTestId('ref-text-area');
    expect(editor).toHaveAttribute('data-accept-drops', 'true');
    expect(editor).toHaveAttribute('data-configurable-chips', 'true');
  });

  // VIS-1327 regression: the merged branch handed RefTextArea the raw `?{ }`
  // value and passed its edits straight to onChange, so a drop/edit saved as
  // a bare string the backend's QueryString type rejects.
  describe('a query-string field wraps/unwraps at its `?{ }` boundary', () => {
    test('shows the unwrapped body, not the raw ?{ } value', () => {
      render(
        <ExpressionField
          objectType="interaction"
          field="filter"
          value="?{status = 'open'}"
          onChange={jest.fn()}
        />
      );
      expect(screen.getByTestId('ref-input')).toHaveValue("status = 'open'");
    });

    test('wraps an edit back into ?{ } before calling onChange', () => {
      const onChange = jest.fn();
      render(
        <ExpressionField
          objectType="interaction"
          field="filter"
          value="?{status = 'open'}"
          onChange={onChange}
        />
      );
      fireEvent.change(screen.getByTestId('ref-input'), {
        target: { value: "status = 'closed'" },
      });
      expect(onChange).toHaveBeenCalledWith("?{status = 'closed'}");
    });

    test('a dropped ref on an empty field still saves ?{ }-wrapped', () => {
      const onChange = jest.fn();
      render(
        <ExpressionField objectType="interaction" field="filter" value="" onChange={onChange} />
      );
      fireEvent.change(screen.getByTestId('ref-input'), {
        target: { value: '${ref(orders).status}' },
      });
      expect(onChange).toHaveBeenCalledWith('?{${ref(orders).status}}');
    });

    test('preserves an existing slice suffix across a body edit', () => {
      const onChange = jest.fn();
      render(
        <ExpressionField objectType="insight" field="x" value="?{amount}[0]" onChange={onChange} />
      );
      expect(screen.getByTestId('ref-input')).toHaveValue('amount');
      fireEvent.change(screen.getByTestId('ref-input'), { target: { value: 'total' } });
      expect(onChange).toHaveBeenCalledWith('?{total}[0]');
    });

    test('a context-sql field is passed through unwrapped (no ?{ })', () => {
      const onChange = jest.fn();
      render(
        <ExpressionField
          objectType="relation"
          field="condition"
          value="${ref(orders).id} = ${ref(users).id}"
          onChange={onChange}
        />
      );
      expect(screen.getByTestId('ref-input')).toHaveValue('${ref(orders).id} = ${ref(users).id}');
      fireEvent.change(screen.getByTestId('ref-input'), {
        target: { value: '${ref(orders).id} = ${ref(users).uid}' },
      });
      expect(onChange).toHaveBeenCalledWith('${ref(orders).id} = ${ref(users).uid}');
    });
  });

  test.each([
    ['relation', 'condition'],
    ['metric', 'expression'],
    ['dimension', 'expression'],
    ['table', 'columns'],
    ['input', 'options'],
    ['interaction', 'filter'],
    ['interaction', 'split'],
    ['interaction', 'sort'],
    ['insight', 'props'],
  ])('%s.%s accepts drops and configurable chips', (objectType, field) => {
    render(<ExpressionField objectType={objectType} field={field} value="" onChange={jest.fn()} />);

    const editor = screen.getByTestId('ref-text-area');
    expect(editor).toHaveAttribute('data-accept-drops', 'true');
    expect(editor).toHaveAttribute('data-configurable-chips', 'true');
    expect(editor.getAttribute('data-allowed-types')).not.toBe('');
  });

  test('a ref-free field gets neither affordance', () => {
    render(
      <ExpressionField
        objectType="metric"
        field="expression"
        nested
        value=""
        onChange={jest.fn()}
      />
    );

    expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('plain-sql-input')).toBeInTheDocument();
  });

  test('object-ref still names the component that owns it', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<ExpressionField objectType="model" field="source" value="" onChange={jest.fn()} />)
    ).toThrow(/RefDropZone/);
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
