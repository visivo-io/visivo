import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChartCRUDSection from './ChartCRUDSection';
import useStore from '../../stores/store';

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

  it('renders chart name in header', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('test_chart')).toBeInTheDocument();
  });

  it('chart name is clickable for rename when not loaded', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = screen.getByTestId('chart-name-input');
    fireEvent.click(nameEl);
    // Should enter rename mode — input appears
    const renameInput = screen.getByTestId('chart-name-input');
    expect(renameInput.tagName).toBe('INPUT');
  });

  it('chart name is not clickable for rename when loaded', () => {
    useStore.setState({ charts: [{ name: 'test_chart' }] });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = screen.getByTestId('chart-name-input');
    fireEvent.click(nameEl);
    // Should NOT enter rename mode — still a span
    expect(nameEl.tagName).toBe('SPAN');
  });

  it('renders insight list with pills', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(screen.getByTestId('chart-insight-pill-insight_1')).toBeInTheDocument();
    expect(screen.getByTestId('chart-insight-pill-insight_2')).toBeInTheDocument();
  });

  it('active insight is highlighted', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const activePill = screen.getByTestId('embedded-pill-insight-insight_1');
    expect(activePill.dataset.active).toBe('true');
  });

  it('remove button on pill calls removeInsightFromChart', () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(screen.getByTestId('embedded-pill-remove-insight_2'));
    expect(removeInsightFromChart).toHaveBeenCalledWith('insight_2');
  });

  it('add insight button calls createInsight', () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(screen.getByTestId('chart-add-insight'));
    expect(createInsight).toHaveBeenCalled();
  });

  it('renders layout SchemaEditor when expanded', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(screen.getByTestId('chart-schema-editor')).toBeInTheDocument();
  });

  it('does not render SchemaEditor when collapsed', () => {
    render(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.queryByTestId('chart-schema-editor')).not.toBeInTheDocument();
  });

  it('chart name is always visible in header even when collapsed', () => {
    render(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('test_chart')).toBeInTheDocument();
  });

  it('collapse/expand toggle works', () => {
    const onToggleExpand = jest.fn();
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByTestId('chart-toggle'));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('close button calls closeChart', () => {
    const closeChart = jest.fn();
    useStore.setState({ closeChart });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(screen.getByTestId('chart-close'));
    expect(closeChart).toHaveBeenCalled();
  });

  it('clicking an insight pill calls setActiveInsight', () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(screen.getByTestId('embedded-pill-insight-insight_2'));
    expect(setActiveInsight).toHaveBeenCalledWith('insight_2');
  });

  it('renders empty insights message when no insights', () => {
    useStore.setState({ explorerChartInsightNames: [], explorerInsightStates: {} });
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(screen.getByText(/no insights/i)).toBeInTheDocument();
  });
});
