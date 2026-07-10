import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObjectField } from './ObjectField';

describe('ObjectField', () => {
  const defaultProps = {
    value: { foo: 'bar', nested: { a: 1 } },
    onChange: jest.fn(),
    schema: { type: 'object' },
    label: 'Props',
    description: 'Object value',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<ObjectField {...defaultProps} />);
    expect(container).toBeInTheDocument();
  });

  it('shows the label', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByText('Props')).toBeInTheDocument();
  });

  it('renders a JSON preview of the object value', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it('shows the "dedicated editor" affordance', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByText(/Edited in a dedicated editor/)).toBeInTheDocument();
  });

  it('renders an empty-object placeholder for undefined value', () => {
    render(<ObjectField {...defaultProps} value={undefined} />);
    expect(screen.getByText('{}')).toBeInTheDocument();
  });

  it('never calls onChange on click interaction', () => {
    const onChange = jest.fn();
    render(<ObjectField {...defaultProps} onChange={onChange} />);
    const preview = screen.getByText(/"foo": "bar"/);
    fireEvent.click(preview);
    fireEvent.mouseDown(preview);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never calls onChange even when disabled prop is passed', () => {
    const onChange = jest.fn();
    render(<ObjectField {...defaultProps} onChange={onChange} disabled />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
