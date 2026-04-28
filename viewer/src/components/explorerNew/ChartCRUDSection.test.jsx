import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import ChartCRUDSection from './ChartCRUDSection';
import useStore from '../../stores/store';

// Each test below uses `await screen.findBy*` for its first DOM lookup so the
// component's async useEffect (getSchema -> setLayoutSchema) is flushed inside
// an act() scope before assertions, eliminating "not wrapped in act" warnings.
const renderInDnd = (ui) => render(<DndContext>{ui}</DndContext>);

jest.mock('../new-views/lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({
    objectType,
    label,
    onRemove,
    onClick,
    statusDot,
    isActive,
  }) {
    return (
      <span
        data-testid={`embedded-pill-${objectType}-${label}`}
        data-active={isActive}
        data-status={statusDot}
        onClick={onClick}
      >
        {label}
        {onRemove && (
          <button
            data-testid={`embedded-pill-remove-${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(e);
            }}
          >
            x
          </button>
        )}
      </span>
    );
  };
});

jest.mock('../new-views/common/SchemaEditor/SchemaEditor', () => {
  const MockSchemaEditor = ({ schema, value, onChange }) => {
    return (
      <div data-testid="chart-schema-editor">
        ChartSchemaEditor: {JSON.stringify(value)}
      </div>
    );
  };
  return { SchemaEditor: MockSchemaEditor, __esModule: true, default: MockSchemaEditor };
});

jest.mock('../../schemas/schemas', () => ({
  getSchema: jest.fn().mockResolvedValue({ properties: { title: {} } }),
}));

const defaultState = {
  explorerChartName: 'test_chart',
  explorerChartLayout: { title: { text: 'My Chart' } },
  explorerChartInsightNames: ['insight_1', 'insight_2'],
  explorerActiveInsightName: 'insight_1',
  charts: [],
  explorerInsightStates: {
    insight_1: {
      type: 'scatter',
      props: {},
      interactions: [],
      typePropsCache: {},
      isNew: true,
    },
    insight_2: {
      type: 'bar',
      props: {},
      interactions: [],
      typePropsCache: {},
      isNew: false,
    },
  },
};

describe('ChartCRUDSection', () => {
  beforeEach(() => {
    useStore.setState(defaultState);
  });

  it('renders chart name in header', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    // Chart name is always rendered as an input (disabled when loaded,
    // editable otherwise). Assert by value rather than text content.
    expect(await screen.findByDisplayValue('test_chart')).toBeInTheDocument();
  });

  it('chart name input is editable when chart is new (not loaded)', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = await screen.findByTestId('chart-name-input');
    expect(nameEl.tagName).toBe('INPUT');
    expect(nameEl).not.toBeDisabled();
  });

  it('chart name input is disabled when chart is loaded from cache', async () => {
    useStore.setState({ charts: [{ name: 'test_chart' }] });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = await screen.findByTestId('chart-name-input');
    expect(nameEl.tagName).toBe('INPUT');
    expect(nameEl).toBeDisabled();
  });

  it('renders insight list with pills', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByTestId('chart-insight-pill-insight_1')).toBeInTheDocument();
    expect(screen.getByTestId('chart-insight-pill-insight_2')).toBeInTheDocument();
  });

  it('active insight is highlighted', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const activePill = await screen.findByTestId('embedded-pill-insight-insight_1');
    expect(activePill.dataset.active).toBe('true');
  });

  it('remove button on pill calls removeInsightFromChart', async () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('embedded-pill-remove-insight_2'));
    expect(removeInsightFromChart).toHaveBeenCalledWith('insight_2');
  });

  it('add insight button calls createInsight', async () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('chart-add-insight'));
    expect(createInsight).toHaveBeenCalled();
  });

  it('renders layout SchemaEditor when expanded', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByTestId('chart-schema-editor')).toBeInTheDocument();
  });

  it('does not render SchemaEditor when collapsed', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);
    // Wait for the always-rendered chart name input so the schema-fetch
    // effect settles before we assert the absence of the schema editor.
    await screen.findByDisplayValue('test_chart');
    expect(screen.queryByTestId('chart-schema-editor')).not.toBeInTheDocument();
  });

  it('chart name is always visible in header even when collapsed', async () => {
    renderInDnd(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);
    expect(await screen.findByDisplayValue('test_chart')).toBeInTheDocument();
  });

  it('collapse/expand toggle works', async () => {
    const onToggleExpand = jest.fn();
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={onToggleExpand} />);
    fireEvent.click(await screen.findByTestId('chart-toggle'));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('close button calls closeChart', async () => {
    const closeChart = jest.fn();
    useStore.setState({ closeChart });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('chart-close'));
    expect(closeChart).toHaveBeenCalled();
  });

  it('clicking an insight pill calls setActiveInsight', async () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('embedded-pill-insight-insight_2'));
    expect(setActiveInsight).toHaveBeenCalledWith('insight_2');
  });

  it('renders empty insights message when no insights', async () => {
    useStore.setState({ explorerChartInsightNames: [], explorerInsightStates: {} });
    renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByText(/no insights/i)).toBeInTheDocument();
  });

  describe('insight drop zone', () => {
    it('renders the drop zone with correct test id when expanded', async () => {
      renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
      expect(await screen.findByTestId('chart-insight-drop-zone')).toBeInTheDocument();
    });

    it('does not render the drop zone when collapsed', async () => {
      renderInDnd(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);
      await screen.findByDisplayValue('test_chart');
      expect(screen.queryByTestId('chart-insight-drop-zone')).not.toBeInTheDocument();
    });

    it('drop zone wraps the insights list and add button', async () => {
      renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const dropZone = await screen.findByTestId('chart-insight-drop-zone');
      expect(dropZone).toContainElement(screen.getByTestId('chart-add-insight'));
      expect(dropZone).toContainElement(screen.getByTestId('chart-insight-pill-insight_1'));
    });

    it('drop zone shows updated empty hint with drag instruction', async () => {
      useStore.setState({ explorerChartInsightNames: [], explorerInsightStates: {} });
      renderInDnd(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
      expect(await screen.findByText(/drag from left nav/i)).toBeInTheDocument();
    });
  });
});
