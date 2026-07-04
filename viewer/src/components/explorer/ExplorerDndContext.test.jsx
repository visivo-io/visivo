/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerDndContext from './ExplorerDndContext';
import useStore from '../../stores/store';

let capturedOnDragEnd = null;
let capturedOnDragStart = null;
let capturedOnDragCancel = null;

jest.mock('../views/lineage/EmbeddedPill', () => {
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
  DndContext: ({ children, onDragEnd, onDragStart, onDragCancel }) => {
    capturedOnDragEnd = onDragEnd;
    capturedOnDragStart = onDragStart;
    capturedOnDragCancel = onDragCancel;
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
  pointerWithin: jest.fn(),
}));

describe('ExplorerDndContext', () => {
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setInsightProp: s.setInsightProp,
      addActiveModelComputedColumn: s.addActiveModelComputedColumn,
      setActiveModelSource: s.setActiveModelSource,
      updateInsightInteraction: s.updateInsightInteraction,
      addExistingInsightToChart: s.addExistingInsightToChart,
    };
  });

  beforeEach(() => {
    useStore.setState({
      ...originalActions,
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

  describe('insight-zone drops', () => {
    it('calls addExistingInsightToChart when an insight is dropped on insight-zone', () => {
      const addExistingInsightToChart = jest.fn();
      useStore.setState({
        addExistingInsightToChart,
        insights: [{ name: 'cached_insight', config: { props: { type: 'bar' } } }],
      });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'cached_insight', type: 'insight' } } },
        over: { data: { current: { type: 'insight-zone' } } },
      });

      expect(addExistingInsightToChart).toHaveBeenCalledWith('cached_insight');
    });

    it('does not call addExistingInsightToChart for non-insight drag types', () => {
      const addExistingInsightToChart = jest.fn();
      useStore.setState({ addExistingInsightToChart });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { type: 'insight-zone' } } },
      });

      expect(addExistingInsightToChart).not.toHaveBeenCalled();
    });

    it('does not call addExistingInsightToChart when drag has no name', () => {
      const addExistingInsightToChart = jest.fn();
      useStore.setState({ addExistingInsightToChart });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { type: 'insight' } } },
        over: { data: { current: { type: 'insight-zone' } } },
      });

      expect(addExistingInsightToChart).not.toHaveBeenCalled();
    });
  });

  describe('drag overlay lifecycle', () => {
    it('shows the dragged pill in the overlay on drag start', () => {
      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      act(() => {
        capturedOnDragStart({
          active: { data: { current: { name: 'col_a', type: 'column' } } },
        });
      });

      const overlay = screen.getByTestId('drag-overlay');
      expect(overlay).toHaveTextContent('col_a');
      expect(overlay.dataset.objectType).toBe('column');
    });

    it('defaults the overlay pill type to model when drag data has no type', () => {
      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      act(() => {
        capturedOnDragStart({ active: { data: { current: { name: 'orders' } } } });
      });

      expect(screen.getByTestId('drag-overlay').dataset.objectType).toBe('model');
    });

    it('clears the overlay on drag cancel', () => {
      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      act(() => {
        capturedOnDragStart({
          active: { data: { current: { name: 'col_a', type: 'column' } } },
        });
      });
      expect(screen.getByTestId('drag-overlay')).toBeInTheDocument();

      act(() => {
        capturedOnDragCancel();
      });
      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument();
    });

    it('clears the overlay on drag end', () => {
      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      act(() => {
        capturedOnDragStart({
          active: { data: { current: { name: 'col_a', type: 'column' } } },
        });
      });

      act(() => {
        capturedOnDragEnd({
          active: { data: { current: { name: 'col_a', type: 'column' } } },
          over: null,
        });
      });
      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument();
    });

    it('shows no overlay when drag start has no data', () => {
      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      act(() => {
        capturedOnDragStart({ active: { data: { current: null } } });
      });

      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument();
    });
  });

  describe('input drops on axis zones', () => {
    it('uses the .values accessor for multi-select inputs', () => {
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
        active: { data: { current: { name: 'regions', type: 'input', inputType: 'multi-select' } } },
        over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
      });

      expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBe(
        '?{${ref(regions).values}}'
      );
    });

    it('uses the .value accessor for single-select inputs', () => {
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
        active: { data: { current: { name: 'threshold', type: 'input', inputType: 'single-select' } } },
        over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
      });

      expect(useStore.getState().explorerInsightStates.ins_1.props.y).toBe(
        '?{${ref(threshold).value}}'
      );
    });
  });

  describe('cursor-aware drops', () => {
    it('dispatches ref-insert-at-cursor when the axis field has an active cursor', () => {
      useStore.setState({
        explorerActiveInsightName: 'ins_1',
        explorerInsightStates: {
          ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
        },
      });

      const insertHandler = jest.fn();
      render(
        <ExplorerDndContext>
          <div data-testid="droppable-property-x">
            <span
              data-has-cursor="true"
              ref={(el) => el && el.addEventListener('ref-insert-at-cursor', insertHandler)}
            />
          </div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
      });

      expect(insertHandler).toHaveBeenCalledTimes(1);
      expect(insertHandler.mock.calls[0][0].detail.refExpr).toBe(
        '${ref(preview_model).col_a}'
      );
      // Value is inserted at the cursor, not replaced wholesale
      expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBeUndefined();
    });

    it('dispatches ref-insert-at-cursor for property-zone paths with a cursor', () => {
      useStore.setState({
        explorerActiveInsightName: 'ins_1',
        explorerInsightStates: {
          ins_1: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
        },
      });

      const insertHandler = jest.fn();
      render(
        <ExplorerDndContext>
          <div data-testid="droppable-property-marker.color">
            <span
              data-has-cursor="true"
              ref={(el) => el && el.addEventListener('ref-insert-at-cursor', insertHandler)}
            />
          </div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_b', type: 'column' } } },
        over: { data: { current: { path: 'marker.color', type: 'property-zone' } } },
      });

      expect(insertHandler).toHaveBeenCalledTimes(1);
      expect(
        useStore.getState().explorerInsightStates.ins_1.props['marker.color']
      ).toBeUndefined();
    });

    it('does not set a prop when there is no active insight', () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp, explorerActiveInsightName: null });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
      });

      expect(setInsightProp).not.toHaveBeenCalled();
    });

    it('dispatches ref-insert-at-cursor when an interaction field has an active cursor', () => {
      const updateInsightInteraction = jest.fn();
      useStore.setState({
        updateInsightInteraction,
        explorerActiveInsightName: 'ins_1',
        explorerInsightStates: {
          ins_1: {
            type: 'scatter', props: {}, interactions: [{ type: 'filter', value: '' }],
            typePropsCache: {}, isNew: true,
          },
        },
      });

      const insertHandler = jest.fn();
      render(
        <ExplorerDndContext>
          <div data-testid="interaction-value-field-0">
            <span
              data-has-cursor="true"
              ref={(el) => el && el.addEventListener('ref-insert-at-cursor', insertHandler)}
            />
          </div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
      });

      expect(insertHandler).toHaveBeenCalledTimes(1);
      expect(insertHandler.mock.calls[0][0].detail.refExpr).toBe(
        '${ref(preview_model).col_a}'
      );
      expect(updateInsightInteraction).not.toHaveBeenCalled();
    });
  });

  describe('interaction-zone edge cases', () => {
    it('drops an input on an interaction zone with the accessor ref', () => {
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
        active: { data: { current: { name: 'regions', type: 'input', inputType: 'multi-select' } } },
        over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
      });

      expect(useStore.getState().explorerInsightStates.ins_1.interactions[0].value).toBe(
        '?{${ref(regions).values}}'
      );
    });

    it('ignores interaction-zone drops without an insight name', () => {
      const updateInsightInteraction = jest.fn();
      useStore.setState({ updateInsightInteraction });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { type: 'interaction-zone', index: 0 } } },
      });

      expect(updateInsightInteraction).not.toHaveBeenCalled();
    });
  });

  describe('data-table drops', () => {
    it('adds a computed column when a metric is dropped on the data table', () => {
      const addActiveModelComputedColumn = jest.fn();
      useStore.setState({ addActiveModelComputedColumn });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: {
          data: {
            current: { name: 'total_rev', type: 'metric', expression: 'SUM(amount)' },
          },
        },
        over: { data: { current: { type: 'data-table-drop' } } },
      });

      expect(addActiveModelComputedColumn).toHaveBeenCalledWith({
        name: 'total_rev',
        expression: 'SUM(amount)',
        type: 'metric',
      });
    });

    it('falls back to the name as expression when the metric has none', () => {
      const addActiveModelComputedColumn = jest.fn();
      useStore.setState({ addActiveModelComputedColumn });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'order_month', type: 'dimension' } } },
        over: { data: { current: { type: 'data-table-drop' } } },
      });

      expect(addActiveModelComputedColumn).toHaveBeenCalledWith({
        name: 'order_month',
        expression: 'order_month',
        type: 'dimension',
      });
    });

    it('ignores non-metric/dimension drops on the data table', () => {
      const addActiveModelComputedColumn = jest.fn();
      useStore.setState({ addActiveModelComputedColumn });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { type: 'data-table-drop' } } },
      });

      expect(addActiveModelComputedColumn).not.toHaveBeenCalled();
    });
  });

  describe('source-zone drops', () => {
    it('sets the active model source when a source is dropped', () => {
      const setActiveModelSource = jest.fn();
      useStore.setState({ setActiveModelSource });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'warehouse_db', type: 'source' } } },
        over: { data: { current: { type: 'source-zone' } } },
      });

      expect(setActiveModelSource).toHaveBeenCalledWith('warehouse_db');
    });

    it('ignores non-source drops on the source zone', () => {
      const setActiveModelSource = jest.fn();
      useStore.setState({ setActiveModelSource });

      render(
        <ExplorerDndContext>
          <div>Content</div>
        </ExplorerDndContext>
      );

      capturedOnDragEnd({
        active: { data: { current: { name: 'col_a', type: 'column' } } },
        over: { data: { current: { type: 'source-zone' } } },
      });

      expect(setActiveModelSource).not.toHaveBeenCalled();
    });
  });

  it('does nothing when the active drag has no data', () => {
    const setInsightProp = jest.fn();
    useStore.setState({ setInsightProp });

    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    capturedOnDragEnd({
      active: { data: { current: null } },
      over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
    });

    expect(setInsightProp).not.toHaveBeenCalled();
  });
});
