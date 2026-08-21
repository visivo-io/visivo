import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InsightEditFormFields from './InsightEditFormFields';

// TracePropsEditor is heavy (schema fetch, AJV) — stub it and assert the
// controlled props are forwarded, which is all this component is responsible
// for.
jest.mock('./TracePropsEditor', () => props => (
  <div
    data-testid="mock-trace-props"
    data-owner={props.ownerName}
    data-droppable={String(!!props.droppable)}
    data-type={props.props?.type}
    onClick={() => props.onDropField && props.onDropField('x', { name: 'col' })}
  />
));

const baseProps = {
  nameValue: 'my_insight',
  onNameChange: jest.fn(),
  ownerName: 'my_insight',
  props: { type: 'scatter' },
  onPropsChange: jest.fn(),
};

describe('InsightEditFormFields', () => {
  it('renders the Basic Information + Visualization Props sections', () => {
    render(<InsightEditFormFields {...baseProps} nameTestId="name-input" />);
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Visualization Props')).toBeInTheDocument();
    expect(screen.getByTestId('name-input')).toHaveValue('my_insight');
    expect(screen.getByTestId('mock-trace-props')).toHaveAttribute('data-owner', 'my_insight');
  });

  it('controls the name field (value / onChange / disabled / error)', () => {
    const onNameChange = jest.fn();
    render(
      <InsightEditFormFields
        {...baseProps}
        onNameChange={onNameChange}
        nameTestId="name-input"
        nameDisabled
        nameError="Bad name"
        nameErrorTestId="name-err"
      />
    );
    const input = screen.getByTestId('name-input');
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: 'x' } });
    expect(onNameChange).toHaveBeenCalled();
    expect(screen.getByTestId('name-err')).toHaveTextContent('Bad name');
  });

  it('hides the name field when showName is false, and description when showDescription is false', () => {
    render(
      <InsightEditFormFields
        {...baseProps}
        showName={false}
        showDescription={false}
        nameTestId="name-input"
      />
    );
    expect(screen.queryByTestId('name-input')).not.toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('forwards droppable + onDropField to the props editor', () => {
    const onDropField = jest.fn();
    render(
      <InsightEditFormFields {...baseProps} droppable onDropField={onDropField} />
    );
    const tp = screen.getByTestId('mock-trace-props');
    expect(tp).toHaveAttribute('data-droppable', 'true');
    fireEvent.click(tp); // the stub calls onDropField on click
    expect(onDropField).toHaveBeenCalledWith('x', { name: 'col' });
  });
});
