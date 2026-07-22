/**
 * ExplorationBuildRail (Explore 2.0 Phase 3b, VIS-1059) — replaces the
 * retired `ExplorerRightPanel` for the exploration surface. Ported test
 * coverage (Chart-above-Insights ordering, save button gating, add-insight,
 * per-insight expand/collapse) plus new coverage for the promoted-trail
 * placeholder. The round-trip ("Save and place in slot") mode is DROPPED —
 * `ExplorerRoundTripContext` only ever wrapped the standalone-route overlay
 * flow, which is retired at the Phase 3b cutover; this rail always renders
 * the plain "Save to Project" button.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorationBuildRail from './ExplorationBuildRail';
import useStore from '../../../stores/store';

jest.mock('./InsightBuildSection', () => {
  return function MockInsightBuildSection({ insightName, isExpanded, onToggleExpand }) {
    return (
      <div data-testid={`insight-build-${insightName}`} data-expanded={isExpanded}>
        InsightBuildSection: {insightName}
        <button data-testid={`mock-insight-toggle-${insightName}`} onClick={onToggleExpand}>
          toggle
        </button>
      </div>
    );
  };
});

jest.mock('./ChartBuildSection', () => {
  return function MockChartBuildSection({ isExpanded, onToggleExpand }) {
    return (
      <div data-testid="chart-build-section" data-expanded={isExpanded}>
        ChartBuildSection
        <button data-testid="mock-chart-toggle" onClick={onToggleExpand}>
          toggle
        </button>
      </div>
    );
  };
});

jest.mock('./ExplorationPromoteModal', () => {
  return function MockExplorationPromoteModal({ onClose }) {
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
    insight_b: { type: 'bar', props: {}, interactions: [], typePropsCache: {}, isNew: false },
  },
  explorerChartName: 'my_chart',
  explorerChartLayout: {},
  workspaceExplorations: { byId: {}, order: [] },
};

describe('ExplorationBuildRail', () => {
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

  it('renders InsightBuildSection for each insight', () => {
    render(<ExplorationBuildRail />);
    expect(screen.getByTestId('insight-build-insight_a')).toBeInTheDocument();
    expect(screen.getByTestId('insight-build-insight_b')).toBeInTheDocument();
  });

  it('active insight is expanded, others collapsed', () => {
    render(<ExplorationBuildRail />);
    expect(screen.getByTestId('insight-build-insight_a')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('insight-build-insight_b')).toHaveAttribute('data-expanded', 'false');
  });

  it('renders ChartBuildSection ABOVE the insight sections', () => {
    const { container } = render(<ExplorationBuildRail />);
    const fullText = container.textContent;
    const chartPos = fullText.indexOf('ChartBuildSection');
    const insightPos = fullText.indexOf('InsightBuildSection:');
    expect(chartPos).toBeGreaterThanOrEqual(0);
    expect(insightPos).toBeGreaterThan(chartPos);
  });

  it('renders save button disabled when no modifications', () => {
    useStore.setState({
      ...defaultState,
      explorerInsightStates: {
        insight_a: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: false },
        insight_b: { type: 'bar', props: {}, interactions: [], typePropsCache: {}, isNew: false },
      },
      explorerModelStates: {},
    });
    render(<ExplorationBuildRail />);
    expect(screen.getByTestId('explorer-save-button')).toBeDisabled();
  });

  it('renders save button enabled when there are modifications', () => {
    render(<ExplorationBuildRail />);
    expect(screen.getByTestId('explorer-save-button')).not.toBeDisabled();
  });

  it('clicking save opens ExplorationPromoteModal (the Phase 4 promote checklist); closing hides it', () => {
    render(<ExplorationBuildRail />);
    expect(screen.queryByTestId('explorer-save-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('explorer-save-button'));
    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-save-close'));
    expect(screen.queryByTestId('explorer-save-modal')).not.toBeInTheDocument();
  });

  it('renders the add-insight button and calls createInsight', () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });
    render(<ExplorationBuildRail />);
    fireEvent.click(screen.getByTestId('right-panel-add-insight'));
    expect(createInsight).toHaveBeenCalled();
  });

  it('toggling the active insight deactivates it; toggling an inactive one activates it', () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });
    render(<ExplorationBuildRail />);
    fireEvent.click(screen.getByTestId('mock-insight-toggle-insight_a'));
    expect(setActiveInsight).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByTestId('mock-insight-toggle-insight_b'));
    expect(setActiveInsight).toHaveBeenCalledWith('insight_b');
  });

  it('toggling the chart section collapses and re-expands it', () => {
    render(<ExplorationBuildRail />);
    const chartSection = screen.getByTestId('chart-build-section');
    expect(chartSection).toHaveAttribute('data-expanded', 'true');
    fireEvent.click(screen.getByTestId('mock-chart-toggle'));
    expect(chartSection).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(screen.getByTestId('mock-chart-toggle'));
    expect(chartSection).toHaveAttribute('data-expanded', 'true');
  });

  it('renders with no insights (empty state) and still shows the Chart section', () => {
    useStore.setState({
      explorerChartInsightNames: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
    });
    render(<ExplorationBuildRail />);
    expect(screen.queryByTestId('insight-build-insight_a')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-build-section')).toBeInTheDocument();
  });

  describe('promoted-trail placeholder', () => {
    it('shows the empty-state hint when no explorationId is given', () => {
      render(<ExplorationBuildRail />);
      expect(screen.getByTestId('exploration-promoted-trail')).toHaveTextContent(
        'Objects you save to project will appear here.'
      );
    });

    it('shows the empty-state hint when the exploration record has no `promoted` key at all', () => {
      useStore.setState({
        workspaceExplorations: {
          byId: { exp_a1: { id: 'exp_a1' } }, // no `promoted` key
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      expect(screen.getByTestId('exploration-promoted-trail')).toHaveTextContent(
        'Objects you save to project will appear here.'
      );
    });

    it('shows the empty-state hint when explorationId is given but the record is not (yet) in the collection', () => {
      // The exploration list hasn't loaded/hydrated this id yet — `byId` has
      // no entry at all (distinct from an entry with an empty `promoted[]`).
      useStore.setState({ workspaceExplorations: { byId: {}, order: [] } });
      render(<ExplorationBuildRail explorationId="exp_not_loaded_yet" />);
      expect(screen.getByTestId('exploration-promoted-trail')).toHaveTextContent(
        'Objects you Save to Project will appear here.'
      );
    });

    it('shows the empty-state hint when the exploration has never promoted anything', () => {
      useStore.setState({
        workspaceExplorations: {
          byId: { exp_a1: { id: 'exp_a1', promoted: [] } },
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      expect(screen.getByTestId('exploration-promoted-trail')).toHaveTextContent(
        'Objects you save to project will appear here.'
      );
    });

    it('lists real promoted entries once the exploration record has them', () => {
      useStore.setState({
        workspaceExplorations: {
          byId: {
            exp_a1: {
              id: 'exp_a1',
              promoted: [
                { type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:00:00Z' },
                { type: 'insight', name: 'churn_by_cohort', promoted_at: '2026-01-01T00:00:01Z' },
              ],
            },
          },
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      expect(screen.getByTestId('exploration-promoted-item-model-orders_q')).toBeInTheDocument();
      expect(
        screen.getByTestId('exploration-promoted-item-insight-churn_by_cohort')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Objects you save to project will appear here.')
      ).not.toBeInTheDocument();
    });

    it('clicking a promoted entry deep-links to the real object via openWorkspaceTab (01 §3b)', () => {
      const openWorkspaceTab = jest.fn();
      useStore.setState({
        openWorkspaceTab,
        workspaceExplorations: {
          byId: {
            exp_a1: {
              id: 'exp_a1',
              promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:00:00Z' }],
            },
          },
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      fireEvent.click(screen.getByTestId('exploration-promoted-item-model-orders_q'));
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'model:orders_q',
        type: 'model',
        name: 'orders_q',
      });
    });

    // D11 / ux-audit.md "PROMOTED ledger duplicates entries (query_1 · model
    // listed twice)": the backend record is an append-only log, so the same
    // object can legitimately appear more than once across repeated saves —
    // the trail must still show each object exactly once.
    it('dedupes repeated entries for the same object, keeping only one row', () => {
      useStore.setState({
        workspaceExplorations: {
          byId: {
            exp_a1: {
              id: 'exp_a1',
              promoted: [
                { type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:00:00Z' },
                { type: 'insight', name: 'insight_1', promoted_at: '2026-01-01T00:00:01Z' },
                { type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:05:00Z' },
              ],
            },
          },
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      expect(
        screen.getAllByTestId('exploration-promoted-item-model-orders_q')
      ).toHaveLength(1);
      expect(
        screen.getByTestId('exploration-promoted-item-insight-insight_1')
      ).toBeInTheDocument();
    });

    it('shows the pending-commit caption once anything has been saved to project', () => {
      useStore.setState({
        workspaceExplorations: {
          byId: {
            exp_a1: {
              id: 'exp_a1',
              promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-01-01T00:00:00Z' }],
            },
          },
          order: ['exp_a1'],
        },
      });
      render(<ExplorationBuildRail explorationId="exp_a1" />);
      expect(screen.getByTestId('exploration-promoted-trail')).toHaveTextContent('pending commit');
    });

    it('does not show the pending-commit caption while nothing has been saved yet', () => {
      render(<ExplorationBuildRail />);
      expect(screen.getByTestId('exploration-promoted-trail')).not.toHaveTextContent(
        'pending commit'
      );
    });
  });

  // D11 — the single user-facing verb for this whole chain is "Save to
  // project", never "Promote".
  it('the CTA reads "Save to project…", never "Promote"', () => {
    render(<ExplorationBuildRail />);
    const button = screen.getByTestId('explorer-save-button');
    expect(button).toHaveTextContent('Save to project…');
    expect(button).not.toHaveTextContent(/promote/i);
  });
});
