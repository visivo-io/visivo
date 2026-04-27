/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightCRUDSection from './InsightCRUDSection';
import useStore from '../../stores/store';

jest.mock('../new-views/common/SchemaEditor/SchemaEditor', () => {
  const MockSchemaEditor = ({ schema, value, onChange, droppable }) => {
    return (
      <div data-testid="schema-editor" data-droppable={droppable}>
        SchemaEditor: {JSON.stringify(value)}
      </div>
    );
  };
  return { SchemaEditor: MockSchemaEditor, __esModule: true, default: MockSchemaEditor };
});

jest.mock('../../schemas/schemas', () => ({
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'pie', label: 'Pie' },
  ],
  getSchema: jest.fn().mockResolvedValue({ properties: { x: {}, y: {} } }),
}));

jest.mock('../new-views/common/insightRequiredFields', () => ({
  getRequiredFields: jest.fn((type) => {
    if (type === 'scatter') return [{ name: 'x' }, { name: 'y' }];
    if (type === 'bar') return [{ name: 'x' }, { name: 'y' }];
    return [];
  }),
}));

const defaultInsightState = {
  type: 'scatter',
  props: { x: '?{${ref(model).col_x}}', y: '?{${ref(model).col_y}}' },
  interactions: [],
  typePropsCache: {},
  isNew: true,
};

const setupStore = (overrides = {}) => {
  useStore.setState({
    explorerInsightStates: {
      test_insight: { ...defaultInsightState },
    },
    explorerActiveInsightName: 'test_insight',
    explorerChartInsightNames: ['test_insight'],
    ...overrides,
  });
};

describe('InsightCRUDSection', () => {
  beforeEach(() => {
    setupStore();
  });

  // Each test uses `await screen.findBy*` for its first DOM lookup so the
  // component's async useEffect (getSchema -> setSchema) is flushed inside
  // an act() scope before assertions. findBy* succeeds immediately when the
  // element is already in the DOM, but the await still drains pending React
  // updates within act, eliminating "not wrapped in act" warnings.

  it('renders insight name with purple styling', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    expect(await screen.findByText('test_insight')).toBeInTheDocument();
    const section = screen.getByTestId('insight-crud-section-test_insight');
    expect(section).toBeInTheDocument();
    const header = screen.getByTestId('insight-header-test_insight');
    expect(header.className).toContain('border-purple');
  });

  it('renders type selector dropdown with CHART_TYPES', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const select = await screen.findByTestId('insight-type-select-test_insight');
    expect(select.value).toBe('scatter');

    const options = within(select).getAllByRole('option');
    expect(options.length).toBe(3);
    expect(options[0]).toHaveValue('scatter');
    expect(options[1]).toHaveValue('bar');
    expect(options[2]).toHaveValue('pie');
  });

  it('changing type calls setInsightType', async () => {
    const setInsightType = jest.fn();
    useStore.setState({ setInsightType });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const select = await screen.findByTestId('insight-type-select-test_insight');
    fireEvent.change(select, { target: { value: 'bar' } });

    expect(setInsightType).toHaveBeenCalledWith('test_insight', 'bar');
  });

  it('renders SchemaEditor with droppable=true when expanded', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const schemaEditor = await screen.findByTestId('schema-editor');
    expect(schemaEditor).toHaveAttribute('data-droppable', 'true');
  });

  it('does not render SchemaEditor when collapsed', async () => {
    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    // Wait for the always-rendered header so the schema-fetch effect settles
    // before we assert the absence of the schema editor.
    await screen.findByTestId('insight-header-test_insight');
    expect(screen.queryByTestId('schema-editor')).not.toBeInTheDocument();
  });

  it('collapse/expand toggle works', async () => {
    const onToggleExpand = jest.fn();

    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={true}
        onToggleExpand={onToggleExpand}
      />
    );

    const toggleButton = await screen.findByTestId('insight-toggle-test_insight');
    fireEvent.click(toggleButton);

    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('remove button calls removeInsightFromChart', async () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const removeButton = await screen.findByTestId('insight-remove-test_insight');
    fireEvent.click(removeButton);

    expect(removeInsightFromChart).toHaveBeenCalledWith('test_insight');
  });

  it('status dot renders green for new insight', async () => {
    useStore.setState({ explorerDiffResult: { insights: { test_insight: 'new' } } });
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const statusDot = await screen.findByTestId('insight-status-dot-test_insight');
    expect(statusDot.className).toContain('bg-green-500');
  });

  it('does not render status dot when not new and unchanged', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          isNew: false,
        },
      },
      explorerDiffResult: { insights: { test_insight: null } },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    await screen.findByTestId('insight-header-test_insight');
    expect(screen.queryByTestId('insight-status-dot-test_insight')).not.toBeInTheDocument();
  });

  it('shows amber status dot when insight is modified', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          isNew: false,
          type: 'bar',
        },
      },
      explorerDiffResult: { insights: { test_insight: 'modified' } },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const dot = await screen.findByTestId('insight-status-dot-test_insight');
    expect(dot.className).toContain('bg-amber-500');
  });

  it('renders interactions section with add button when expanded', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    expect(await screen.findByTestId('insight-add-interaction-test_insight')).toBeInTheDocument();
  });

  it('renders existing interactions', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          interactions: [
            { type: 'filter', value: 'some_filter_value' },
            { type: 'sort', value: 'some_sort_value' },
          ],
        },
      },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    await screen.findByTestId('insight-interaction-0');
    const interactions = screen.getAllByTestId(/^insight-interaction-/);
    expect(interactions.length).toBe(2);
  });

  it('add interaction button calls addInsightInteraction', async () => {
    const addInsightInteraction = jest.fn();
    useStore.setState({ addInsightInteraction });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    fireEvent.click(await screen.findByTestId('insight-add-interaction-test_insight'));
    expect(addInsightInteraction).toHaveBeenCalledWith('test_insight', {
      type: 'filter',
      value: '',
    });
  });

  it('remove interaction button calls removeInsightInteraction', async () => {
    const removeInsightInteraction = jest.fn();
    useStore.setState({
      removeInsightInteraction,
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          interactions: [{ type: 'filter', value: 'val' }],
        },
      },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const removeBtn = await screen.findByTestId('insight-remove-interaction-0');
    fireEvent.click(removeBtn);
    expect(removeInsightInteraction).toHaveBeenCalledWith('test_insight', 0);
  });

  it('clicking header sets active insight', async () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });

    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const header = await screen.findByTestId('insight-header-test_insight');
    fireEvent.click(header);

    expect(setActiveInsight).toHaveBeenCalledWith('test_insight');
  });

  it('renders nothing when insight state does not exist', async () => {
    useStore.setState({
      explorerInsightStates: {},
    });

    render(
      <InsightCRUDSection
        insightName="nonexistent"
        isExpanded={true}
        onToggleExpand={jest.fn()}
      />
    );

    // Component returns null, so there's no element to findBy. waitFor wraps
    // the assertion in act() and lets the schema-fetch effect settle.
    await waitFor(() => {
      expect(screen.queryByTestId('insight-crud-section-nonexistent')).not.toBeInTheDocument();
    });
  });
});
