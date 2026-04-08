/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerDndContext from './ExplorerDndContext';
import useStore from '../../stores/store';

let capturedOnDragEnd = null;

jest.mock('../new-views/lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({ objectType, label, size, as }) {
    const Tag = as === 'div' ? 'div' : 'button';
    return (
      <Tag data-testid="drag-overlay" data-object-type={objectType} data-size={size}>
        {label}
      </Tag>
    );
  };
});

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
      explorerInsightStates: {},
      explorerActiveInsightName: null,
      explorerChartInsightNames: [],
      explorerModelStates: {},
      explorerModelTabs: [],
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

  it('sets column drop as ref format with preview_model fallback', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBe(
      '?{${ref(preview_model).col_a}}'
    );
  });

  it('sets column drop as full ref format with active model', () => {
    useStore.setState({
      explorerActiveModelName: 'test_model',
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBe(
      '?{${ref(test_model).col_a}}'
    );
  });

  it('sets model-scoped metric drop with parentModel in ref', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'total_revenue', type: 'metric', parentModel: 'orders_model' } } },
      over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props.y).toBe(
      '?{${ref(orders_model).total_revenue}}'
    );
  });

  it('sets global metric drop as bare ref (no parentModel)', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'composite_metric', type: 'metric' } } },
      over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props.y).toBe(
      '?{${ref(composite_metric)}}'
    );
  });

  it('sets model-scoped dimension drop with parentModel in ref', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'order_month', type: 'dimension', parentModel: 'orders_model' } } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBe(
      '?{${ref(orders_model).order_month}}'
    );
  });

  it('sets insight prop on property-zone drop', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_b', type: 'column' } } },
      over: { data: { current: { path: 'marker.color', type: 'property-zone' } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props['marker.color']).toBe(
      '?{${ref(preview_model).col_b}}'
    );
  });

  it('drops column on interaction-zone with ?{} wrapped ref', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: {
          type: 'scatter', props: {}, interactions: [{ type: 'filter', value: '' }],
          typePropsCache: {}, isNew: true,
        },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.interactions[0].value).toBe(
      '?{${ref(preview_model).col_a}}'
    );
  });

  it('drops metric with parentModel on interaction-zone', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: {
          type: 'scatter', props: {}, interactions: [{ type: 'filter', value: '' }],
          typePropsCache: {}, isNew: true,
        },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'avg_value', type: 'metric', parentModel: 'daily_metrics' } } },
      over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
    });

    expect(useStore.getState().explorerInsightStates.ins_1.interactions[0].value).toBe(
      '?{${ref(daily_metrics).avg_value}}'
    );
  });

  it('replaces entire interaction value on drop when no cursor', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: {
          type: 'scatter', props: {},
          interactions: [{ type: 'filter', value: '?{${ref(model).x} > }' }],
          typePropsCache: {}, isNew: true,
        },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'threshold', type: 'input', inputType: 'single-select' } } },
      over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
    });

    // No cursor in the field → replace entire value (not append)
    expect(useStore.getState().explorerInsightStates.ins_1.interactions[0].value).toBe(
      '?{${ref(threshold).value}}'
    );
  });

  it('does nothing when dropped on no target', () => {
    useStore.setState({
      explorerActiveInsightName: 'ins_1',
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
      },
    });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: { name: 'col_a', type: 'column' } } },
      over: null,
    });

    expect(useStore.getState().explorerInsightStates.ins_1.props).toEqual({});
  });
});
