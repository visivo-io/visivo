import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerRightPanel from './ExplorerRightPanel';
import { ExplorerRoundTripProvider } from './ExplorerRoundTripContext';
import useStore from '../../stores/store';

jest.mock('./InsightCRUDSection', () => {
  return function MockInsightCRUDSection({ insightName, isExpanded, onToggleExpand }) {
    return (
      <div
        data-testid={`insight-crud-${insightName}`}
        data-expanded={isExpanded}
      >
        InsightCRUD: {insightName}
        <button data-testid={`mock-insight-toggle-${insightName}`} onClick={onToggleExpand}>
          toggle
        </button>
      </div>
    );
  };
});

jest.mock('./ChartCRUDSection', () => {
  return function MockChartCRUDSection({ isExpanded, onToggleExpand }) {
    return (
      <div data-testid="chart-crud-section" data-expanded={isExpanded}>
        ChartCRUDSection
        <button data-testid="mock-chart-toggle" onClick={onToggleExpand}>
          toggle
        </button>
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
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setActiveInsight: s.setActiveInsight,
      createInsight: s.createInsight,
    };
  });

  beforeEach(() => {
    useStore.setState({ ...originalActions, ...defaultState });
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

  it('add insight button calls createInsight', () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });

    render(<ExplorerRightPanel />);
    fireEvent.click(screen.getByTestId('right-panel-add-insight'));

    expect(createInsight).toHaveBeenCalled();
  });

  it('toggling the active insight deactivates it', () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });

    render(<ExplorerRightPanel />);
    fireEvent.click(screen.getByTestId('mock-insight-toggle-insight_a'));

    expect(setActiveInsight).toHaveBeenCalledWith(null);
  });

  it('toggling an inactive insight activates it', () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });

    render(<ExplorerRightPanel />);
    fireEvent.click(screen.getByTestId('mock-insight-toggle-insight_b'));

    expect(setActiveInsight).toHaveBeenCalledWith('insight_b');
  });

  it('toggling the chart section collapses and re-expands it', () => {
    render(<ExplorerRightPanel />);

    const chartSection = screen.getByTestId('chart-crud-section');
    expect(chartSection).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(screen.getByTestId('mock-chart-toggle'));
    expect(chartSection).toHaveAttribute('data-expanded', 'false');

    fireEvent.click(screen.getByTestId('mock-chart-toggle'));
    expect(chartSection).toHaveAttribute('data-expanded', 'true');
  });

  describe('round-trip mode', () => {
    const renderWithRoundTrip = (roundTrip) =>
      render(
        <ExplorerRoundTripProvider value={roundTrip}>
          <ExplorerRightPanel />
        </ExplorerRoundTripProvider>
      );

    it('replaces the save button with "Save and place in slot"', () => {
      renderWithRoundTrip({ saving: false, onSaveAndPlace: jest.fn() });

      expect(screen.getByTestId('explorer-save-and-place-button')).toBeInTheDocument();
      expect(screen.queryByTestId('explorer-save-button')).not.toBeInTheDocument();
      expect(screen.getByText('Save and place in slot')).toBeInTheDocument();
    });

    it('clicking save-and-place routes to the round-trip handler, not the modal', () => {
      const onSaveAndPlace = jest.fn();
      renderWithRoundTrip({ saving: false, onSaveAndPlace });

      fireEvent.click(screen.getByTestId('explorer-save-and-place-button'));

      expect(onSaveAndPlace).toHaveBeenCalled();
      expect(screen.queryByTestId('explorer-save-modal')).not.toBeInTheDocument();
    });

    it('shows "Placing…" and disables the button while saving', () => {
      renderWithRoundTrip({ saving: true, onSaveAndPlace: jest.fn() });

      const btn = screen.getByTestId('explorer-save-and-place-button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent('Placing…');
    });

    it('disables save-and-place when there are no modifications', () => {
      useStore.setState({
        explorerInsightStates: {
          insight_a: {
            type: 'scatter',
            props: {},
            interactions: [],
            typePropsCache: {},
            isNew: false,
          },
        },
        explorerChartInsightNames: ['insight_a'],
        explorerModelStates: {},
        explorerDiffResult: null,
      });

      renderWithRoundTrip({ saving: false, onSaveAndPlace: jest.fn() });

      expect(screen.getByTestId('explorer-save-and-place-button')).toBeDisabled();
    });

    it('does not crash when onSaveAndPlace is missing', () => {
      renderWithRoundTrip({ saving: false });

      fireEvent.click(screen.getByTestId('explorer-save-and-place-button'));

      expect(screen.getByTestId('explorer-save-and-place-button')).toBeInTheDocument();
    });
  });
});
