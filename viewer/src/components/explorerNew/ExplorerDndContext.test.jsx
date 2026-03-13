/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerDndContext from './ExplorerDndContext';
import useStore from '../../stores/store';

let capturedOnDragEnd = null;

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => {
    capturedOnDragEnd = onDragEnd;
    return (
      <div data-testid="dnd-context" data-ondragend={!!onDragEnd}>
        {children}
      </div>
    );
  },
  DragOverlay: ({ children }) => (
    <div data-testid="drag-overlay-container">{children}</div>
  ),
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

describe('ExplorerDndContext', () => {
  beforeEach(() => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerComputedColumns: [],
      explorerActiveModelName: null,
    });
  });

  it('renders DndContext wrapper around children', () => {
    render(
      <ExplorerDndContext>
        <div data-testid="child">Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders DragOverlay container', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('drag-overlay-container')).toBeInTheDocument();
  });

  it('has onDragEnd handler', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('dnd-context').dataset.ondragend).toBe('true');
  });

  it('sets column drop as fallback format without active model', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightConfig.props.x).toBe('?{col_a}');
  });

  it('sets column drop as full ref format with active model', () => {
    useStore.setState({ explorerActiveModelName: 'test_model' });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightConfig.props.x).toBe(
      '?{${ref(test_model).col_a}}'
    );
  });

  it('sets metric drop as ref format', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'total_revenue', type: 'metric' } } },
      over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightConfig.props.y).toBe(
      '?{${ref(total_revenue)}}'
    );
  });

  it('sets dimension drop as ref format', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'order_month', type: 'dimension' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightConfig.props.x).toBe(
      '?{${ref(order_month)}}'
    );
  });

  it('sets insight prop on property-zone drop', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_b', type: 'column' } } },
      over: { data: { current: { path: 'marker.color', type: 'property-zone' } } },
    });

    expect(useStore.getState().explorerInsightConfig.props['marker.color']).toBe('?{col_b}');
  });

  it('does nothing when dropped on no target', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    const before = { ...useStore.getState().explorerInsightConfig.props };

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: null,
    });

    expect(useStore.getState().explorerInsightConfig.props).toEqual(before);
  });
});
