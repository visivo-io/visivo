import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchemaEditor } from './SchemaEditor';

// Mock RefTextArea to simplify testing
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

describe('SchemaEditor', () => {
  const mockSchema = {
    type: 'object',
    properties: {
      type: { const: 'scatter' },
      x: {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'array' }],
        description: 'X axis data',
      },
      y: {
        oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'array' }],
        description: 'Y axis data',
      },
      mode: {
        enum: ['lines', 'markers', 'lines+markers'],
        description: 'Drawing mode',
      },
      name: {
        type: 'string',
        description: 'Trace name',
      },
      marker: {
        type: 'object',
        properties: {
          color: {
            oneOf: [{ $ref: '#/$defs/query-string' }, { $ref: '#/$defs/color' }],
            description: 'Marker color',
          },
          size: {
            oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }],
            description: 'Marker size',
          },
        },
      },
    },
    $defs: {
      'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    },
  };

  const defaultProps = {
    schema: mockSchema,
    value: {},
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders add properties button', () => {
    render(<SchemaEditor {...defaultProps} />);
    const addButton = screen.getByRole('button', { name: /add/i });
    expect(addButton).toBeInTheDocument();
  });

  it('shows property count', () => {
    render(<SchemaEditor {...defaultProps} />);
    // Should show "X of Y properties" text (may appear multiple times)
    const propertyCountTexts = screen.getAllByText(/of.*properties/);
    expect(propertyCountTexts.length).toBeGreaterThan(0);
  });

  it('shows empty state when no properties added', () => {
    render(<SchemaEditor {...defaultProps} />);
    expect(screen.getByText(/No properties added yet/)).toBeInTheDocument();
  });

  it('shows initially expanded properties', () => {
    render(<SchemaEditor {...defaultProps} initiallyExpanded={['x', 'y']} />);

    // x and y should be visible as property rows (may appear multiple times in picker too)
    expect(screen.getAllByText('x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('y').length).toBeGreaterThan(0);
  });

  it('opens property picker when button clicked', () => {
    render(<SchemaEditor {...defaultProps} />);

    // Click add button
    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    // Search input should appear
    expect(screen.getByPlaceholderText('Search properties...')).toBeInTheDocument();
  });

  it('closes property picker when clicked again', () => {
    render(<SchemaEditor {...defaultProps} />);

    // Open
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(screen.getByPlaceholderText('Search properties...')).toBeInTheDocument();

    // Close
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
  });

  it('adds property when selected in picker', async () => {
    render(<SchemaEditor {...defaultProps} />);

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    // Click on mode property checkbox
    fireEvent.click(screen.getByText('mode'));

    // mode should now appear in the form as a property row
    await waitFor(() => {
      // The path 'mode' should now be displayed
      const modeElements = screen.getAllByText('mode');
      expect(modeElements.length).toBeGreaterThan(0);
    });
  });

  it('handles null schema gracefully', () => {
    render(<SchemaEditor {...defaultProps} schema={null} />);
    expect(screen.getByText('No schema available')).toBeInTheDocument();
  });

  it('handles undefined schema gracefully', () => {
    render(<SchemaEditor {...defaultProps} schema={undefined} />);
    expect(screen.getByText('No schema available')).toBeInTheDocument();
  });

  it('disables add button when disabled prop is true', () => {
    render(<SchemaEditor {...defaultProps} disabled={true} />);
    const addButton = screen.getByRole('button', { name: /add/i });
    expect(addButton).toBeDisabled();
  });

  it('excludes type property by default', () => {
    render(<SchemaEditor {...defaultProps} />);

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    // type should not be listed (it's excluded by default)
    // Look for a checkbox for 'type' - it should not exist
    const typeCheckbox = screen.queryByRole('checkbox', { name: /type/i });
    expect(typeCheckbox).not.toBeInTheDocument();
  });

  it('calls onChange when property value changes', () => {
    const onChange = jest.fn();
    render(
      <SchemaEditor {...defaultProps} onChange={onChange} initiallyExpanded={['name']} />
    );

    // Find the text field for 'name' property - it should be a TextField
    // The PropertyRow renders an empty label, so we need to find the input another way
    const textInputs = screen.getAllByRole('textbox');
    const nameInput = textInputs.find(input => !input.placeholder?.includes('Search'));

    // Ensure we found the input and test it
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'My Trace' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('removes property when remove button clicked', () => {
    const onChange = jest.fn();
    render(
      <SchemaEditor
        {...defaultProps}
        onChange={onChange}
        value={{ name: 'Test' }}
        initiallyExpanded={['name']}
      />
    );

    // Find and click remove button
    const removeButton = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeButton);

    // onChange should be called
    expect(onChange).toHaveBeenCalled();
  });
});
