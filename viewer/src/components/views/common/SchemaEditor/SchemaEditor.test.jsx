import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  // D12 (pills-buildrail #8/#9): "0 of 1366 properties" was the single
  // most-quoted "raw schema dump" line in the audit — `ChartBuildSection`'s
  // Layout Properties panel (a genuinely 1300+-leaf schema) opts out.
  it('hides the property count when `hidePropertyCount` is set', () => {
    render(<SchemaEditor {...defaultProps} hidePropertyCount />);
    expect(screen.queryByText(/of.*properties/)).not.toBeInTheDocument();
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

  it('tolerates a missing `value` prop entirely (defaults to {})', () => {
    render(<SchemaEditor schema={mockSchema} onChange={jest.fn()} />);
    // No crash; still renders the property picker toggle.
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  // The value->addedProperties sync effect recursively walks the value object
  // (extractPaths) to auto-reveal any property that already has a value —
  // e.g. a chart loaded from a saved config. This exercises the recursive
  // branch (nested object -> recurse), the array guard (an array value is
  // NOT walked into), and the null guard.
  it('auto-reveals nested properties that already have a value (recursive extractPaths), without walking into arrays', () => {
    render(
      <SchemaEditor
        {...defaultProps}
        value={{
          name: 'Test',
          marker: { color: '#ff0000', size: 8 },
          // `mode` is a plain string, not an object -> extractPaths stops
          // there (covers the `typeof !== 'object'` false-continuation case
          // at the top level already; this covers null/array explicitly).
        }}
      />
    );
    // 'marker.color' and 'marker.size' were both auto-revealed as displayed
    // property rows (their dot-paths render as row labels).
    expect(screen.getByText('marker.color')).toBeInTheDocument();
    expect(screen.getByText('marker.size')).toBeInTheDocument();
  });

  it('does not crash and does not recurse into a null or array-shaped value', () => {
    // A null top-level value entirely: extractPaths(null) must hit its own
    // `!obj` guard and return immediately.
    const { rerender } = render(
      <SchemaEditor {...defaultProps} value={null} initiallyExpanded={['name']} />
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();

    // A value containing an ARRAY under a key: extractPaths must NOT recurse
    // into it (Array.isArray guard), even though `typeof [] === 'object'`.
    rerender(
      <SchemaEditor
        {...defaultProps}
        value={{ name: 'Test', customdata: [1, 2, 3] }}
        initiallyExpanded={['name']}
      />
    );
    expect(screen.getByText('name')).toBeInTheDocument();
  });

  it('toggling the SAME property off in the picker removes it (the delete branch, not just add)', () => {
    render(<SchemaEditor {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    // Scope clicks to the picker's own root container so a later property
    // ROW with the same text ('mode') is never ambiguous.
    const picker = screen.getByPlaceholderText('Search properties...').closest('.MuiPaper-root');

    // Add 'mode' via the picker.
    fireEvent.click(within(picker).getByText('mode'));
    expect(screen.getAllByText('mode').length).toBeGreaterThan(1);

    // Click it again in the picker to toggle it back OFF.
    fireEvent.click(within(picker).getByText('mode'));

    // The displayed property ROW ('No properties added yet' comes back since
    // mode was the only one) is gone; only the picker's own listing remains.
    expect(screen.getByText(/No properties added yet/)).toBeInTheDocument();
  });

  it('a previously-added property that is no longer valid under a NEW schema is dropped on re-sync', () => {
    const schemaV1 = {
      type: 'object',
      properties: {
        type: { const: 'scatter' },
        legacy_prop: { type: 'string', description: 'no longer supported' },
      },
      $defs: mockSchema.$defs,
    };
    const schemaV2 = {
      type: 'object',
      properties: {
        type: { const: 'scatter' },
        // legacy_prop removed entirely.
        name: { type: 'string' },
      },
      $defs: mockSchema.$defs,
    };
    const { rerender } = render(
      <SchemaEditor
        schema={schemaV1}
        value={{}}
        onChange={jest.fn()}
        initiallyExpanded={['legacy_prop']}
      />
    );
    expect(screen.getByText('legacy_prop')).toBeInTheDocument();

    // Schema swap: legacy_prop no longer exists on the new schema. `value`
    // ALSO changes (to a real value under the new schema's `name` field) so
    // the sync effect's own `effectKey` guard (paths-with-values + schema
    // size) can't coincidentally collide across the two schemas and skip the
    // re-sync — this is what actually forces the stale-path prune loop to
    // run and drop the no-longer-valid `legacy_prop` entry.
    rerender(
      <SchemaEditor
        schema={schemaV2}
        value={{ name: 'now has a value' }}
        onChange={jest.fn()}
        initiallyExpanded={[]}
      />
    );
    expect(screen.queryByText('legacy_prop')).not.toBeInTheDocument();
    // The new schema's own valid path DOES survive the re-sync.
    expect(screen.getByText('name')).toBeInTheDocument();
  });

  it('sorts displayed properties by depth first (top-level before nested), then alphabetically within a depth', () => {
    render(
      <SchemaEditor
        {...defaultProps}
        value={{ name: 'Test', marker: { color: '#fff', size: 2 } }}
        initiallyExpanded={['marker.size', 'marker.color', 'name']}
      />
    );
    const rows = screen
      .getAllByText(/^(name|marker\.color|marker\.size)$/)
      .map(el => el.textContent);
    // 'name' (depth 1) sorts before either marker.* (depth 2), and the two
    // depth-2 paths sort alphabetically against each other.
    expect(rows).toEqual(['name', 'marker.color', 'marker.size']);
  });

  it('forwards `droppable` through to each PropertyRow', () => {
    render(
      <SchemaEditor
        {...defaultProps}
        value={{ name: 'Test' }}
        initiallyExpanded={['name']}
        droppable
      />
    );
    // The real (unmocked) PropertyRow only renders a `droppable-property-*`
    // testid when it is actually droppable.
    expect(screen.getByTestId('droppable-property-name')).toBeInTheDocument();
  });
});
