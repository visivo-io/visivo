import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerRightPanel from './ExplorerRightPanel';
import useStore from '../../stores/store';

jest.mock('./InsightCRUDSection', () => {
  return function MockInsightCRUDSection({ insightName, isExpanded }) {
    return (
      <div
        data-testid={`insight-crud-${insightName}`}
        data-expanded={isExpanded}
      >
        InsightCRUD: {insightName}
      </div>
    );
  };
});

jest.mock('./ChartCRUDSection', () => {
  return function MockChartCRUDSection({ isExpanded }) {
    return (
      <div data-testid="chart-crud-section" data-expanded={isExpanded}>
        ChartCRUDSection
      </div>
    );
  };
});

const defaultState = {
  explorerChartInsightNames: ['insight_a', 'insight_b'],
  explorerActiveInsightName: 'insight_a',
  explorerInsightStates: {
    insight_a: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
    insight_b: { type: 'bar', props: {}, interactions: [], typePropsCache: {}, isNew: false },
  },
  explorerChartName: 'my_chart',
  explorerChartLayout: {},
};

describe('ExplorerRightPanel', () => {
  beforeEach(() => {
    useStore.setState(defaultState);
  });

  it('renders InsightCRUDSection for each insight', () => {
    render(<ExplorerRightPanel />);

    expect(screen.getByTestId('insight-crud-insight_a')).toBeInTheDocument();
    expect(screen.getByTestId('insight-crud-insight_b')).toBeInTheDocument();
  });

  it('active insight is expanded, others collapsed', () => {
    render(<ExplorerRightPanel />);

    const insightA = screen.getByTestId('insight-crud-insight_a');
    const insightB = screen.getByTestId('insight-crud-insight_b');

    expect(insightA).toHaveAttribute('data-expanded', 'true');
    expect(insightB).toHaveAttribute('data-expanded', 'false');
  });

  it('renders ChartCRUDSection', () => {
    render(<ExplorerRightPanel />);

    expect(screen.getByTestId('chart-crud-section')).toBeInTheDocument();
  });

  it('renders save button', () => {
    render(<ExplorerRightPanel />);

    const saveBtn = screen.getByTestId('explorer-save-button');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });

  it('has scrollable content area', () => {
    render(<ExplorerRightPanel />);

    const panel = screen.getByTestId('explorer-right-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.className).toContain('overflow');
  });

  it('renders add insight button', () => {
    render(<ExplorerRightPanel />);

    expect(screen.getByTestId('right-panel-add-insight')).toBeInTheDocument();
  });

  it('renders empty state when no insights exist', () => {
    useStore.setState({
      explorerChartInsightNames: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
    });

    render(<ExplorerRightPanel />);

    expect(screen.queryByTestId('insight-crud-insight_a')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-crud-section')).toBeInTheDocument();
  });
});
