import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChartCRUDSection from './ChartCRUDSection';
import useStore from '../../stores/store';

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

  it('renders chart name input', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const nameInput = screen.getByTestId('chart-name-input');
    expect(nameInput).toBeInTheDocument();
    expect(nameInput.value).toBe('test_chart');
  });

  it('name change calls setChartName', () => {
    const setChartName = jest.fn();
    useStore.setState({ setChartName });

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const nameInput = screen.getByTestId('chart-name-input');
    fireEvent.change(nameInput, { target: { value: 'new_chart_name' } });

    expect(setChartName).toHaveBeenCalledWith('new_chart_name');
  });

  it('renders insight list with pills', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    expect(screen.getByTestId('chart-insight-pill-insight_1')).toBeInTheDocument();
    expect(screen.getByTestId('chart-insight-pill-insight_2')).toBeInTheDocument();
  });

  it('active insight is highlighted', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const activePill = screen.getByTestId('chart-insight-pill-insight_1');
    expect(activePill.className).toContain('ring-2');
  });

  it('remove button on pill calls removeInsightFromChart', () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const removeBtn = screen.getByTestId('chart-remove-insight-insight_2');
    fireEvent.click(removeBtn);

    expect(removeInsightFromChart).toHaveBeenCalledWith('insight_2');
  });

  it('add insight button calls createInsight', () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const addBtn = screen.getByTestId('chart-add-insight');
    fireEvent.click(addBtn);

    expect(createInsight).toHaveBeenCalled();
  });

  it('renders layout SchemaEditor when expanded', () => {
    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    expect(screen.getByTestId('chart-schema-editor')).toBeInTheDocument();
  });

  it('does not render content when collapsed', () => {
    render(<ChartCRUDSection isExpanded={false} onToggleExpand={jest.fn()} />);

    expect(screen.queryByTestId('chart-name-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-schema-editor')).not.toBeInTheDocument();
  });

  it('collapse/expand toggle works', () => {
    const onToggleExpand = jest.fn();

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={onToggleExpand} />);

    const toggleBtn = screen.getByTestId('chart-toggle');
    fireEvent.click(toggleBtn);

    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('clicking an insight pill calls setActiveInsight', () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    const pill = screen.getByTestId('chart-insight-pill-insight_2');
    fireEvent.click(pill);

    expect(setActiveInsight).toHaveBeenCalledWith('insight_2');
  });

  it('renders empty insights message when no insights', () => {
    useStore.setState({
      explorerChartInsightNames: [],
      explorerInsightStates: {},
    });

    render(<ChartCRUDSection isExpanded={true} onToggleExpand={jest.fn()} />);

    expect(screen.getByText(/no insights/i)).toBeInTheDocument();
  });
});
