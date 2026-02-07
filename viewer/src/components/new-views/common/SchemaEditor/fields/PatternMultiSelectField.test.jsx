import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatternMultiSelectField } from './PatternMultiSelectField';

describe('PatternMultiSelectField', () => {
  const patternSchema = {
    oneOf: [
      {
        type: 'string',
        pattern: '^(lines|markers|text)(\\+(lines|markers|text))*$',
      },
      {
        type: 'string',
        enum: ['none', 'skip'],
      },
      {
        $ref: '#/$defs/query-string',
      },
    ],
  };

  const defaultProps = {
    value: undefined,
    onChange: jest.fn(),
    schema: patternSchema,
    defs: { 'query-string': { type: 'string' } },
    label: 'Mode',
    description: 'Select visualization mode',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with label', () => {
      render(<PatternMultiSelectField {...defaultProps} />);
      expect(screen.getByText('Mode')).toBeInTheDocument();
    });

    it('renders with description', () => {
      render(<PatternMultiSelectField {...defaultProps} />);
      expect(screen.getByText('Select visualization mode')).toBeInTheDocument();
    });

    it('renders all pattern options as chips', () => {
      render(<PatternMultiSelectField {...defaultProps} />);
      expect(screen.getByText('lines')).toBeInTheDocument();
      expect(screen.getByText('markers')).toBeInTheDocument();
      expect(screen.getByText('text')).toBeInTheDocument();
    });

    it('renders enum options as chips', () => {
      render(<PatternMultiSelectField {...defaultProps} />);
      expect(screen.getByText('none')).toBeInTheDocument();
      expect(screen.getByText('skip')).toBeInTheDocument();
    });

    it('renders without label when not provided', () => {
      render(<PatternMultiSelectField {...defaultProps} label={undefined} />);
      // Check that no label text is rendered (the div with font-medium class)
      expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    });

    it('renders without description when not provided', () => {
      render(<PatternMultiSelectField {...defaultProps} description={undefined} />);
      expect(screen.queryByText('Select visualization mode')).not.toBeInTheDocument();
    });
  });

  describe('Pattern Options - Multi-select behavior', () => {
    it('allows selecting a single pattern option', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} onChange={onChange} />);

      fireEvent.click(screen.getByText('lines'));

      expect(onChange).toHaveBeenCalledWith('lines');
    });

    it('allows selecting multiple pattern options', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PatternMultiSelectField {...defaultProps} onChange={onChange} />
      );

      fireEvent.click(screen.getByText('lines'));
      expect(onChange).toHaveBeenCalledWith('lines');

      // Simulate value update
      onChange.mockClear();
      rerender(<PatternMultiSelectField {...defaultProps} value="lines" onChange={onChange} />);

      fireEvent.click(screen.getByText('markers'));
      expect(onChange).toHaveBeenCalledWith('lines+markers');
    });

    it('allows deselecting a pattern option', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers" onChange={onChange} />);

      fireEvent.click(screen.getByText('lines'));

      expect(onChange).toHaveBeenCalledWith('markers');
    });

    it('calls onChange with undefined when last option is deselected', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} value="lines" onChange={onChange} />);

      fireEvent.click(screen.getByText('lines'));

      expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('displays selected pattern options with correct styling', () => {
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers" />);

      const linesButton = screen.getByRole('button', { name: 'lines' });
      const markersButton = screen.getByRole('button', { name: 'markers' });
      const textButton = screen.getByRole('button', { name: 'text' });

      expect(linesButton).toHaveClass('border-blue-500');
      expect(markersButton).toHaveClass('border-blue-500');
      expect(textButton).not.toHaveClass('border-blue-500');
    });

    it('shows selection count for pattern options', () => {
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers" />);
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
  });

  describe('Enum Options - Mutually exclusive behavior', () => {
    it('allows selecting an enum option', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} onChange={onChange} />);

      fireEvent.click(screen.getByText('none'));

      expect(onChange).toHaveBeenCalledWith('none');
    });

    it('deselects enum option when clicked again', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} value="none" onChange={onChange} />);

      fireEvent.click(screen.getByText('none'));

      expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('switches between enum options', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} value="none" onChange={onChange} />);

      fireEvent.click(screen.getByText('skip'));

      expect(onChange).toHaveBeenCalledWith('skip');
    });

    it('displays selected enum option with correct styling', () => {
      render(<PatternMultiSelectField {...defaultProps} value="none" />);

      const noneButton = screen.getByRole('button', { name: 'none' });
      const skipButton = screen.getByRole('button', { name: 'skip' });

      expect(noneButton).toHaveClass('border-orange-500');
      expect(skipButton).not.toHaveClass('border-orange-500');
    });

    it('shows enum value in selection indicator', () => {
      render(<PatternMultiSelectField {...defaultProps} value="none" />);
      expect(screen.getByText('"none" selected')).toBeInTheDocument();
    });

    it('clears pattern selections when enum is selected', () => {
      render(<PatternMultiSelectField {...defaultProps} value="none" />);

      const linesButton = screen.getByRole('button', { name: 'lines' });
      expect(linesButton).not.toHaveClass('border-blue-500');
    });
  });

  describe('Clear functionality', () => {
    it('shows clear button when pattern options are selected', () => {
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers" />);
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('shows clear button when enum option is selected', () => {
      render(<PatternMultiSelectField {...defaultProps} value="none" />);
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('does not show clear button when nothing is selected', () => {
      render(<PatternMultiSelectField {...defaultProps} value={undefined} />);
      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    });

    it('clears all selections when clear button is clicked', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers" onChange={onChange} />);

      fireEvent.click(screen.getByText('Clear all'));

      expect(onChange).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Disabled state', () => {
    it('disables all buttons when disabled prop is true', () => {
      render(<PatternMultiSelectField {...defaultProps} disabled={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('does not call onChange when disabled buttons are clicked', () => {
      const onChange = jest.fn();
      render(<PatternMultiSelectField {...defaultProps} disabled={true} onChange={onChange} />);

      fireEvent.click(screen.getByText('lines'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('applies disabled styling to buttons', () => {
      render(<PatternMultiSelectField {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'lines' });
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });

  describe('Schema parsing', () => {
    it('handles nested oneOf structures', () => {
      const nestedSchema = {
        oneOf: [
          {
            oneOf: [
              {
                type: 'string',
                pattern: '^(lines|markers)(\\+(lines|markers))*$',
              },
            ],
          },
          {
            type: 'string',
            enum: ['none'],
          },
        ],
      };

      render(<PatternMultiSelectField {...defaultProps} schema={nestedSchema} />);

      expect(screen.getByText('lines')).toBeInTheDocument();
      expect(screen.getByText('markers')).toBeInTheDocument();
      expect(screen.getByText('none')).toBeInTheDocument();
    });

    it('skips query-string references', () => {
      const schemaWithRef = {
        oneOf: [
          {
            $ref: '#/$defs/query-string',
          },
          {
            type: 'string',
            pattern: '^(lines|markers)(\\+(lines|markers))*$',
          },
        ],
      };

      render(<PatternMultiSelectField {...defaultProps} schema={schemaWithRef} />);

      // Should only show pattern options, not fail on query-string ref
      expect(screen.getByText('lines')).toBeInTheDocument();
      expect(screen.getByText('markers')).toBeInTheDocument();
    });

    it('handles empty schema gracefully', () => {
      render(<PatternMultiSelectField {...defaultProps} schema={{}} />);

      // Should render without errors, just no options
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles undefined schema gracefully', () => {
      render(<PatternMultiSelectField {...defaultProps} schema={undefined} />);

      // Should render without errors, just no options
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles schema without oneOf/anyOf', () => {
      const simpleSchema = {
        type: 'string',
        pattern: '^(lines|markers)(\\+(lines|markers))*$',
      };

      render(<PatternMultiSelectField {...defaultProps} schema={simpleSchema} />);

      // Should render without errors, just no options (needs oneOf wrapper)
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Value parsing', () => {
    it('parses complex pattern values correctly', () => {
      render(<PatternMultiSelectField {...defaultProps} value="lines+markers+text" />);

      const linesButton = screen.getByRole('button', { name: 'lines' });
      const markersButton = screen.getByRole('button', { name: 'markers' });
      const textButton = screen.getByRole('button', { name: 'text' });

      expect(linesButton).toHaveClass('border-blue-500');
      expect(markersButton).toHaveClass('border-blue-500');
      expect(textButton).toHaveClass('border-blue-500');
      expect(screen.getByText('3 selected')).toBeInTheDocument();
    });

    it('handles null value', () => {
      render(<PatternMultiSelectField {...defaultProps} value={null} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toHaveClass('border-blue-500');
        expect(button).not.toHaveClass('border-orange-500');
      });
    });

    it('handles empty string value', () => {
      render(<PatternMultiSelectField {...defaultProps} value="" />);

      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('combines multiple pattern options correctly', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PatternMultiSelectField {...defaultProps} onChange={onChange} />
      );

      // Select markers first
      fireEvent.click(screen.getByText('markers'));
      expect(onChange).toHaveBeenCalledWith('markers');

      onChange.mockClear();
      rerender(<PatternMultiSelectField {...defaultProps} value="markers" onChange={onChange} />);

      // Select lines - adds to selection
      fireEvent.click(screen.getByText('lines'));
      const firstCall = onChange.mock.calls[0][0];
      // Should contain both markers and lines
      expect(firstCall).toContain('markers');
      expect(firstCall).toContain('lines');
      expect(firstCall).toContain('+');

      onChange.mockClear();
      rerender(
        <PatternMultiSelectField {...defaultProps} value={firstCall} onChange={onChange} />
      );

      // Select text - adds to selection
      fireEvent.click(screen.getByText('text'));
      const secondCall = onChange.mock.calls[0][0];
      // Should contain all three
      expect(secondCall).toContain('markers');
      expect(secondCall).toContain('lines');
      expect(secondCall).toContain('text');
      expect((secondCall.match(/\+/g) || []).length).toBe(2); // Two plus signs
    });

    it('handles schema with anyOf instead of oneOf', () => {
      const anyOfSchema = {
        anyOf: [
          {
            type: 'string',
            pattern: '^(lines|markers)(\\+(lines|markers))*$',
          },
          {
            type: 'string',
            enum: ['none'],
          },
        ],
      };

      render(<PatternMultiSelectField {...defaultProps} schema={anyOfSchema} />);

      expect(screen.getByText('lines')).toBeInTheDocument();
      expect(screen.getByText('markers')).toBeInTheDocument();
      expect(screen.getByText('none')).toBeInTheDocument();
    });
  });
});
