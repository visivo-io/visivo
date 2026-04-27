import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyRow } from './PropertyRow';

// Mock the RefTextArea component
jest.mock('../RefTextArea', () => {
  return function MockRefTextArea({ value, onChange, helperText, disabled }) {
    return (
      <div data-testid="ref-text-area">
        <input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          data-testid="ref-input"
        />
        {helperText && <span>{helperText}</span>}
      </div>
    );
  };
});

describe('PropertyRow', () => {
  const defs = {
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' },
  };

  const defaultProps = {
    path: 'marker.color',
    value: undefined,
    onChange: jest.fn(),
    onRemove: jest.fn(),
    schema: { type: 'string' },
    defs,
    description: 'Set the marker color',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with property path', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByText('marker.color')).toBeInTheDocument();
  });

  it('renders remove button', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onRemove when remove button clicked', () => {
    const onRemove = jest.fn();
    render(<PropertyRow {...defaultProps} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows static field for non-query-string schema', () => {
    render(<PropertyRow {...defaultProps} />);

    // Should render a text field, not RefTextArea
    expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
  });

  it('shows toggle buttons when query-string is supported', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} />);

    expect(screen.getByRole('button', { name: /static/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /query/i })).toBeInTheDocument();
  });

  it('does not show toggle buttons when query-string not supported', () => {
    render(<PropertyRow {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /static/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /query/i })).not.toBeInTheDocument();
  });

  it('shows RefTextArea when value is a query-string', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="?{column_name}" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('shows RefTextArea when in query mode with query() pattern', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="query(SELECT x FROM t)" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('shows RefTextArea when in query mode with column() pattern', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="column(date)" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('static mode is selected by default for non-query value', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="hello" />);

    const staticButton = screen.getByRole('button', { name: /static/i });
    expect(staticButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('query mode is selected for query-string value', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="?{column}" />);

    const queryButton = screen.getByRole('button', { name: /query/i });
    expect(queryButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('preserves value when switching modes', () => {
    const onChange = jest.fn();
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="hello" onChange={onChange} />);

    // Click query mode - value should be preserved, not cleared
    fireEvent.click(screen.getByRole('button', { name: /query/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders description as helper text', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByText('Set the marker color')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} disabled={true} />);

    expect(screen.getByRole('button', { name: /static/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /query/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
  });

  it('does not render remove button when onRemove is not provided', () => {
    render(<PropertyRow {...defaultProps} onRemove={undefined} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Slice integration — body + slice round-trip via SliceBadge.
  // ---------------------------------------------------------------------

  describe('slice badge integration', () => {
    const queryNumberSchema = {
      // Indicator-style scalar: oneOf [query-string, number] → scalar-only
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }],
    };

    const queryNumberOrArraySchema = {
      // Mixed: data_array post-fix shape
      oneOf: [
        { $ref: '#/$defs/query-string' },
        { type: 'number' },
        { type: 'array', items: { type: 'number' } },
      ],
    };

    it('renders SliceBadge alongside RefTextArea when value has a slice', () => {
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
        />
      );
      // RefTextArea receives the body only — no brackets in the chip.
      expect(screen.getByTestId('ref-input').value).toBe('my_col');
      // Badge shows the human-readable slice label.
      expect(screen.getByTestId('slice-badge')).toHaveTextContent(/First \(0\)/);
    });

    it('badge label updates with the slice value', () => {
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberOrArraySchema}
          value="?{my_col}[1:5]"
        />
      );
      expect(screen.getByTestId('slice-badge')).toHaveTextContent(/Rows 1-5/);
    });

    it('editing the chip body preserves the slice in the saved value', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{old_col}[0]"
          onChange={onChange}
        />
      );
      const input = screen.getByTestId('ref-input');
      fireEvent.change(input, { target: { value: 'new_col' } });
      expect(onChange).toHaveBeenCalledWith('?{new_col}[0]');
    });

    it('changing the slice via the badge preserves the body', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberOrArraySchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByTestId('slice-badge'));
      fireEvent.click(screen.getByTestId('slice-option-last'));
      expect(onChange).toHaveBeenCalledWith('?{my_col}[-1]');
    });

    it('auto-applies [0] when chip body becomes non-empty in a scalar-only slot', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      // Simulate the parent push of a value that arrives with a chip
      // body but no slice (e.g., from a DnD drop).
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).toHaveBeenCalledWith('?{my_col}[0]');
    });

    it('does NOT auto-apply a slice on array-only slot drops', () => {
      const onChange = jest.fn();
      const arrayOnlySchema = {
        oneOf: [
          { $ref: '#/$defs/query-string' },
          { type: 'array', items: { type: 'number' } },
        ],
      };
      const { rerender } = render(
        <PropertyRow {...defaultProps} schema={arrayOnlySchema} value="" onChange={onChange} />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={arrayOnlySchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows the SliceBanner after auto-applying default slice on scalar drop', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      // Step 1 — DnD drop pushes the unsliced value: PropertyRow's
      // useEffect auto-applies [0] and turns on bannerActive.
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).toHaveBeenCalledWith('?{my_col}[0]');
      // Step 2 — parent state updates, the auto-applied value flows
      // back. Banner is now rendered.
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      expect(screen.getByTestId('slice-banner')).toBeInTheDocument();
    });

    it('banner dismisses on user action (First quick button)', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      expect(screen.getByTestId('slice-banner')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('slice-banner-first'));
      expect(screen.queryByTestId('slice-banner')).not.toBeInTheDocument();
    });

    it('clears slice when chip body becomes empty', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{old}[0]"
          onChange={onChange}
        />
      );
      // Simulate clearing the chip via the editor
      const input = screen.getByTestId('ref-input');
      fireEvent.change(input, { target: { value: '' } });
      // The serialized form for body='' is '' (not '?{}[0]').
      expect(onChange).toHaveBeenCalledWith('');
      rerender(
        <PropertyRow {...defaultProps} schema={queryNumberSchema} value="" onChange={onChange} />
      );
      expect(screen.queryByTestId('slice-badge')).not.toBeInTheDocument();
    });
  });
});
