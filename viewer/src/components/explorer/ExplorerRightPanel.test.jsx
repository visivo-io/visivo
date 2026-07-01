import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('./ExplorerSaveModal', () => {
  return function MockExplorerSaveModal({ onClose }) {
    return (
      <div data-testid="explorer-save-modal">
        SaveModal
        <button data-testid="mock-save-close" onClick={onClose}>
          close
        </button>
      </div>
    );
  };
});

const defaultState = {
  explorerChartInsightNames: ['insight_a', 'insight_b'],
  explorerActiveInsightName: 'insight_a',
  explorerInsightStates: {
    insight_a: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
    insight_b: {
      type: 'bar',
      props: {},
      interactions: [],
      typePropsCache: {},
      isNew: false,
    },
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

  it('renders save button disabled when no modifications', () => {
    useStore.setState({
      ...defaultState,
      explorerInsightStates: {
        insight_a: {
          type: 'scatter',
          props: {},
          interactions: [],
          typePropsCache: {},
          isNew: false,
        },
        insight_b: {
          type: 'bar',
          props: {},
          interactions: [],
          typePropsCache: {},
          isNew: false,
        },
      },
      explorerModelStates: {},
    });

    render(<ExplorerRightPanel />);

    const saveBtn = screen.getByTestId('explorer-save-button');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });

  it('renders save button enabled when there are modifications', () => {
    render(<ExplorerRightPanel />);

    const saveBtn = screen.getByTestId('explorer-save-button');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).not.toBeDisabled();
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

  it('renders chart section above insight sections', () => {
    const { container } = render(<ExplorerRightPanel />);

    // Get all rendered text content — chart should appear before insights
    const fullText = container.textContent;
    const chartPos = fullText.indexOf('ChartCRUDSection');
    const insightPos = fullText.indexOf('InsightCRUD:');

    expect(chartPos).toBeGreaterThanOrEqual(0);
    expect(insightPos).toBeGreaterThan(chartPos);
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

  it('clicking save button opens save modal when there are changes', () => {
    render(<ExplorerRightPanel />);

    // Modal should not be visible initially
    expect(screen.queryByTestId('explorer-save-modal')).not.toBeInTheDocument();

    // Click save button (enabled because defaultState has a new insight)
    fireEvent.click(screen.getByTestId('explorer-save-button'));

    // Modal should now be visible
    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();
  });

  it('closing save modal hides it', () => {
    render(<ExplorerRightPanel />);

    fireEvent.click(screen.getByTestId('explorer-save-button'));
    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-save-close'));
    expect(screen.queryByTestId('explorer-save-modal')).not.toBeInTheDocument();
  });
});
