import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmbeddedPill from './EmbeddedPill';

jest.mock('../common/objectTypeConfigs', () => ({
  getTypeByValue: (type) => {
    if (type === 'source')
      return {
        icon: (props) => (
          <span data-testid="type-icon" style={props.style} className={props.className}>
            icon
          </span>
        ),
        colors: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
      };
    if (type === 'insight')
      return {
        icon: (props) => (
          <span data-testid="type-icon" style={props.style} className={props.className}>
            insight-icon
          </span>
        ),
        colors: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
      };
    return null;
  },
  DEFAULT_COLORS: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
}));

describe('EmbeddedPill', () => {
  it('renders icon and label from objectType config', () => {
    render(<EmbeddedPill objectType="source" label="duckdb" />);

    expect(screen.getByTestId('type-icon')).toBeInTheDocument();
    expect(screen.getByText('duckdb')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<EmbeddedPill objectType="source" label="duckdb" onClick={handleClick} />);

    fireEvent.click(screen.getByText('duckdb'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders x button when onRemove provided', () => {
    const handleRemove = jest.fn();
    render(<EmbeddedPill objectType="source" label="duckdb" onRemove={handleRemove} />);

    expect(screen.getByTestId('pill-remove')).toBeInTheDocument();
  });

  it('clicking x calls onRemove and stops propagation', () => {
    const handleRemove = jest.fn();
    const handleClick = jest.fn();
    render(
      <EmbeddedPill
        objectType="source"
        label="duckdb"
        onClick={handleClick}
        onRemove={handleRemove}
      />
    );

    fireEvent.click(screen.getByTestId('pill-remove'));
    expect(handleRemove).toHaveBeenCalledTimes(1);
    // onClick should NOT be called because stopPropagation is called on the remove button
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders green dot when statusDot='new'", () => {
    render(<EmbeddedPill objectType="source" label="duckdb" statusDot="new" />);

    const dot = screen.getByTestId('status-dot-new');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('bg-green-500');
  });

  it("renders amber dot when statusDot='modified'", () => {
    render(<EmbeddedPill objectType="source" label="duckdb" statusDot="modified" />);

    const dot = screen.getByTestId('status-dot-modified');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('bg-amber-500');
  });

  it('no dot rendered when statusDot is null', () => {
    render(<EmbeddedPill objectType="source" label="duckdb" statusDot={null} />);

    expect(screen.queryByTestId('status-dot-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-dot-modified')).not.toBeInTheDocument();
  });

  it('isActive adds ring-2 highlight', () => {
    render(<EmbeddedPill objectType="source" label="duckdb" isActive={true} />);

    const pill = screen.getByRole('button');
    expect(pill.className).toContain('ring-2');
  });

  it("size='md' applies larger padding", () => {
    render(<EmbeddedPill objectType="source" label="duckdb" size="md" />);

    const pill = screen.getByRole('button');
    expect(pill.className).toContain('px-2');
    expect(pill.className).toContain('py-1');
    expect(pill.className).toContain('text-sm');
  });

  it("renders as div when as='div'", () => {
    render(<EmbeddedPill objectType="source" label="duckdb" as="div" />);

    const pill = screen.getByTitle('Embedded source: duckdb - Click to edit');
    expect(pill.tagName).toBe('DIV');
  });

  it('renders as button by default', () => {
    render(<EmbeddedPill objectType="source" label="duckdb" />);

    const pill = screen.getByRole('button');
    expect(pill.tagName).toBe('BUTTON');
  });

  it('uses DEFAULT_COLORS for unknown objectType', () => {
    render(<EmbeddedPill objectType="unknown_type" label="test" />);

    const pill = screen.getByRole('button');
    expect(pill.className).toContain('bg-gray-100');
    expect(pill.className).toContain('border-gray-200');
  });

  it('appends className when provided', () => {
    render(
      <EmbeddedPill objectType="source" label="duckdb" className="custom-class extra" />
    );

    const pill = screen.getByRole('button');
    expect(pill.className).toContain('custom-class');
    expect(pill.className).toContain('extra');
  });
});
