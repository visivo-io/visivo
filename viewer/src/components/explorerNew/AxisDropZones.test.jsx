import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AxisDropZones from './AxisDropZones';
import useStore from '../../stores/store';

// Mock @dnd-kit/core
jest.mock('@dnd-kit/core', () => ({
  useDroppable: ({ id }) => ({
    isOver: false,
    setNodeRef: jest.fn(),
  }),
}));

jest.mock('../new-views/common/insightRequiredFields', () => ({
  getRequiredFields: (type) => {
    if (type === 'scatter') {
      return [
        { name: 'x', label: 'X Axis', type: 'dataArray', description: 'X coord' },
        { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Y coord' },
      ];
    }
    if (type === 'pie') {
      return [
        { name: 'values', label: 'Values', type: 'dataArray', description: 'Values' },
        { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Labels', optional: true },
      ];
    }
    return [];
  },
}));

describe('AxisDropZones', () => {
  beforeEach(() => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerQueryResult: { columns: ['a', 'b'], rows: [{ a: 1, b: 2 }], row_count: 1 },
    });
  });

  it('renders drop zones for required dataArray fields', () => {
    render(<AxisDropZones />);

    expect(screen.getByTestId('axis-drop-zones')).toBeInTheDocument();
    expect(screen.getByTestId('axis-zone-x')).toBeInTheDocument();
    expect(screen.getByTestId('axis-zone-y')).toBeInTheDocument();
  });

  it('shows pills when props have values', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'col_a', y: 'col_b' } },
      explorerQueryResult: { columns: ['col_a', 'col_b'], rows: [{}], row_count: 1 },
    });

    render(<AxisDropZones />);

    expect(screen.getByTestId('axis-pill-x')).toHaveTextContent('col_a');
    expect(screen.getByTestId('axis-pill-y')).toHaveTextContent('col_b');
  });

  it('shows drag hint when no value assigned', () => {
    render(<AxisDropZones />);

    expect(screen.getByText('Drag column here')).toBeInTheDocument();
  });

  it('removes prop when × clicked', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'col_a' } },
      explorerQueryResult: { columns: ['col_a'], rows: [{}], row_count: 1 },
    });

    render(<AxisDropZones />);

    fireEvent.click(screen.getByTestId('axis-remove-x'));

    const props = useStore.getState().explorerInsightConfig.props;
    expect(props.x).toBeUndefined();
    expect(props.type).toBe('scatter');
  });

  it('does not render when no query result', () => {
    useStore.setState({
      explorerQueryResult: null,
    });

    const { container } = render(<AxisDropZones />);
    expect(container.innerHTML).toBe('');
  });

  it('adapts to chart type', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'pie' } },
      explorerQueryResult: { columns: ['a', 'b'], rows: [{}], row_count: 1 },
    });

    render(<AxisDropZones />);

    expect(screen.getByTestId('axis-zone-values')).toBeInTheDocument();
    expect(screen.getByTestId('axis-zone-labels')).toBeInTheDocument();
    expect(screen.queryByTestId('axis-zone-x')).not.toBeInTheDocument();
  });

  it('shows required indicator for non-optional fields', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'pie' } },
      explorerQueryResult: { columns: ['a'], rows: [{}], row_count: 1 },
    });

    render(<AxisDropZones />);

    // Values is required, Labels is optional
    const valuesZone = screen.getByTestId('axis-zone-values');
    expect(valuesZone.querySelector('span.text-highlight')).toBeInTheDocument();
  });
});
