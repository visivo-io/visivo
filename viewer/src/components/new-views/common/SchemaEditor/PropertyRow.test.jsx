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

  it('calls onChange with undefined when switching modes', () => {
    const onChange = jest.fn();
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="hello" onChange={onChange} />);

    // Click query mode
    fireEvent.click(screen.getByRole('button', { name: /query/i }));

    expect(onChange).toHaveBeenCalledWith(undefined);
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
});
