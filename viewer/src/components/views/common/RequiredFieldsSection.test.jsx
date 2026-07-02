import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequiredFieldsSection from './RequiredFieldsSection';

// Mock RefTextArea since it has complex dependencies
jest.mock('./RefTextArea', () => ({ id, label, value, onChange, error, required, helperText }) => (
  <div data-testid={`ref-textarea-${id}`}>
    <label htmlFor={id}>
      {label}
      {required && <span>*</span>}
    </label>
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={!!error}
    />
    {error && <span role="alert">{error}</span>}
    {helperText && <span>{helperText}</span>}
  </div>
));

describe('RequiredFieldsSection', () => {
  const defaultFields = [
    {
      name: 'x',
      label: 'X Axis',
      placeholder: 'Enter X values',
      description: 'Data for the x-axis',
      optional: false,
    },
    {
      name: 'y',
      label: 'Y Axis',
      placeholder: 'Enter Y values',
      description: 'Data for the y-axis',
      optional: false,
    },
    {
      name: 'color',
      label: 'Color',
      placeholder: 'Enter color column',
      optional: true,
    },
  ];

  const defaultValues = {
    x: 'ref(model_name).column_x',
    y: 'ref(model_name).column_y',
  };

  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when fields array is empty', () => {
    render(
      <RequiredFieldsSection fields={[]} values={{}} errors={{}} onChange={mockOnChange} />
    );
    expect(screen.queryByText('Required Data Fields')).not.toBeInTheDocument();
  });

  it('renders section title and all fields', () => {
    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Required Data Fields')).toBeInTheDocument();
    expect(screen.getByLabelText(/X Axis/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Y Axis/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Color/)).toBeInTheDocument();
  });

  it('renders custom title when provided', () => {
    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
        title="Custom Field Title"
      />
    );

    expect(screen.getByText('Custom Field Title')).toBeInTheDocument();
    expect(screen.queryByText('Required Data Fields')).not.toBeInTheDocument();
  });

  it('displays field values correctly', () => {
    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
      />
    );

    const xField = screen.getByLabelText(/X Axis/);
    const yField = screen.getByLabelText(/Y Axis/);

    expect(xField).toHaveValue('ref(model_name).column_x');
    expect(yField).toHaveValue('ref(model_name).column_y');
  });

  it('displays error messages for fields with errors', () => {
    const errors = {
      x: 'X axis is required',
      y: 'Invalid reference',
    };

    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={errors}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('X axis is required')).toBeInTheDocument();
    expect(screen.getByText('Invalid reference')).toBeInTheDocument();
  });

  it('calls onChange when field value changes', async () => {
    const user = userEvent.setup();

    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
      />
    );

    const xField = screen.getByLabelText(/X Axis/);
    await user.clear(xField);
    await user.type(xField, 'new_value');

    expect(mockOnChange).toHaveBeenCalled();
    // Get the last call's arguments
    const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe('x');
  });

  it('shows required indicator for required fields', () => {
    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
      />
    );

    // X and Y are required - check labels contain asterisk
    expect(screen.getByText(/X Axis/, { selector: 'label' })).toHaveTextContent('*');
    expect(screen.getByText(/Y Axis/, { selector: 'label' })).toHaveTextContent('*');
  });

  it('displays helper text for fields with descriptions', () => {
    render(
      <RequiredFieldsSection
        fields={defaultFields}
        values={defaultValues}
        errors={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Data for the x-axis')).toBeInTheDocument();
    expect(screen.getByText('Data for the y-axis')).toBeInTheDocument();
  });
});
