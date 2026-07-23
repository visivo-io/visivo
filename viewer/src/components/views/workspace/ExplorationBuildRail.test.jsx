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
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  insights: [],
};

describe('ExplorationBuildRail', () => {
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setActiveInsight: s.setActiveInsight,
      createInsight: s.createInsight,
      addExistingInsightToChart: s.addExistingInsightToChart,
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

  // Phase 6c-T5 (ux-audit.md "'+ Add Insight' creates a blank insight
  // instead of letting you pick an existing one" finding): the button now
  // opens a picker offering "New blank insight" alongside existing insights
  // in the project not already on this chart, instead of instantly
  // manufacturing a blank one.
  describe('"+ Add Insight" picker (Phase 6c-T5)', () => {
    it('clicking the button opens a menu instead of immediately creating a blank insight', () => {
      const createInsight = jest.fn();
      useStore.setState({ createInsight, insights: [] });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));
      expect(screen.getByTestId('add-insight-menu')).toBeInTheDocument();
      expect(createInsight).not.toHaveBeenCalled();
    });

    it('"New blank insight" still creates a blank insight (secondary action, not gone)', () => {
      const createInsight = jest.fn();
      useStore.setState({ createInsight, insights: [] });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));
      fireEvent.click(screen.getByTestId('add-insight-menu-create-new'));
      expect(createInsight).toHaveBeenCalled();
      expect(screen.queryByTestId('add-insight-menu')).not.toBeInTheDocument();
    });

    it('offers existing project insights NOT already on this chart, and picking one adds it via addExistingInsightToChart', () => {
      const addExistingInsightToChart = jest.fn();
      useStore.setState({
        addExistingInsightToChart,
        insights: [
          { name: 'insight_a', config: {} }, // already on the chart — excluded
          { name: 'churn_by_cohort', config: {} },
          { name: 'revenue_over_time', config: {} },
        ],
      });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));

      expect(screen.queryByTestId('add-insight-menu-existing-insight_a')).not.toBeInTheDocument();
      expect(screen.getByTestId('add-insight-menu-existing-churn_by_cohort')).toBeInTheDocument();
      expect(screen.getByTestId('add-insight-menu-existing-revenue_over_time')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('add-insight-menu-existing-churn_by_cohort'));
      expect(addExistingInsightToChart).toHaveBeenCalledWith('churn_by_cohort');
      expect(screen.queryByTestId('add-insight-menu')).not.toBeInTheDocument();
    });

    it('the search box filters the pickable list by name', () => {
      useStore.setState({
        insights: [
          { name: 'churn_by_cohort', config: {} },
          { name: 'revenue_over_time', config: {} },
        ],
      });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));
      fireEvent.change(screen.getByTestId('add-insight-menu-search'), {
        target: { value: 'churn' },
      });
      expect(screen.getByTestId('add-insight-menu-existing-churn_by_cohort')).toBeInTheDocument();
      expect(
        screen.queryByTestId('add-insight-menu-existing-revenue_over_time')
      ).not.toBeInTheDocument();
    });

    it('shows an honest empty state when there are no other insights to pick', () => {
      useStore.setState({ insights: [] });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));
      expect(screen.getByTestId('add-insight-menu')).toHaveTextContent(
        'No other insights in this project yet.'
      );
    });

    it('shows a distinct "no matches" message when every OTHER insight is already on this chart', () => {
      useStore.setState({ insights: [{ name: 'insight_a', config: {} }] });
      render(<ExplorationBuildRail />);
      fireEvent.click(screen.getByTestId('right-panel-add-insight'));
      expect(screen.getByTestId('add-insight-menu')).toHaveTextContent(
        'No matches — every other insight is already on this chart.'
      );
    });

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
        'Objects you save to project will appear here.'
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

  // D11 (walkthrough finding, post-Wave-1): "the chip is still labelled
  // model/insight during live editing" — the fix is a proactive effect that
  // applies the SAME suggestion logic `promoteNaming.js` already used at
  // save time, live, the moment a placeholder-named tab/insight has a real
  // anchor. These assert against the store directly (not the chip DOM —
  // `ExplorationQueryChips` isn't mounted by this component at all) since
  // that's the one true source the chip, the tab strip, and the promote
  // checklist all read from.
  describe('live auto-suggest naming (D11 proactive — chip still read "model"/"insight" while editing)', () => {
    it('renames a generic-named model tab to <source>_query the moment it has a bound source', async () => {
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: {
          model: { isNew: true, sourceName: 'orders_db', sql: '' },
        },
        defaults: { source_name: 'orders_db' },
      });
      render(<ExplorationBuildRail />);
      await waitFor(() => {
        expect(useStore.getState().explorerModelTabs).toEqual(['orders_db_query']);
      });
      expect(useStore.getState().explorerModelStates['orders_db_query']).toBeTruthy();
      expect(useStore.getState().explorerModelStates.model).toBeUndefined();
    });

    it('renames a generic-named insight to <model>_insight once its model already has a real name', async () => {
      useStore.setState({
        explorerModelTabs: ['orders_db_query'],
        explorerModelStates: { orders_db_query: { isNew: true, sourceName: 'orders_db' } },
        explorerChartInsightNames: ['insight'],
        explorerActiveInsightName: 'insight',
        explorerInsightStates: {
          insight: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
        },
      });
      render(<ExplorationBuildRail />);
      await waitFor(() => {
        expect(useStore.getState().explorerChartInsightNames).toEqual(['orders_db_query_insight']);
      });
    });

    it('leaves a generic-named model tab untouched when it has no bound source yet — never guesses', async () => {
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: true, sourceName: null } },
        defaults: { source_name: 'orders_db' },
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['model']);
    });

    it('never touches a model tab that already has a real, user-given name', async () => {
      useStore.setState({
        explorerModelTabs: ['orders_query'],
        explorerModelStates: { orders_query: { isNew: true, sourceName: 'orders_db' } },
        defaults: { source_name: 'orders_db' },
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['orders_query']);
    });

    it('never touches a "modified" (update-by-name) tab even if its name happens to look generic', async () => {
      // renameModelTab's own isNew guard is the safety net here — this pins
      // that the live effect relies on it rather than re-deriving new-ness.
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: false, sourceName: 'orders_db' } },
        defaults: { source_name: 'orders_db' },
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['model']);
    });

    it('does NOT rename a model tab off its source while project defaults have not loaded yet (VIS-1082 cold-session race)', async () => {
      // Regression pin: `useExplorerWorkbenchInit.js`'s rebind effect
      // (`applyResolvedDefaultSource`) corrects a cold-session tab's
      // TEMPORARY fallback source by looking the tab up by its ORIGINAL
      // name once `defaults` lands. If this effect had already renamed the
      // tab off that temporary source first, the rebind's name lookup would
      // silently miss and the real default would never land — caught by
      // `explorer-cold-session-default-source.spec.mjs`. `defaults: null`
      // (the actual initial store value before `fetchDefaults()` resolves)
      // must keep this effect from touching the name at all.
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: true, sourceName: 'local-sqlite' } },
        defaults: null,
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['model']);
    });

    it('renames off the source once defaults load, even when the fallback source already happened to match (no other state change to re-trigger the effect)', async () => {
      // The common non-racy case: `applyResolvedDefaultSource` no-ops when
      // the fallback source already equals the real default, so
      // `explorerModelStates` never changes once `defaults` arrives — this
      // effect must still notice (via `defaults` in its own dependency
      // array) and suggest a name rather than leaving the tab generic
      // forever.
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: true, sourceName: 'orders_db' } },
        defaults: null,
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['model']);

      act(() => {
        useStore.setState({ defaults: { source_name: 'orders_db' } });
      });
      await waitFor(() => {
        expect(useStore.getState().explorerModelTabs).toEqual(['orders_db_query']);
      });
    });

    it('is idempotent — the rename fires once and does not oscillate on re-render', async () => {
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: true, sourceName: 'orders_db' } },
        defaults: { source_name: 'orders_db' },
      });
      const { rerender } = render(<ExplorationBuildRail />);
      await waitFor(() => {
        expect(useStore.getState().explorerModelTabs).toEqual(['orders_db_query']);
      });
      rerender(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerModelTabs).toEqual(['orders_db_query']);
    });

    it('leaves a generic-named insight untouched when there is no model tab at all to anchor on', async () => {
      useStore.setState({
        explorerModelTabs: [],
        explorerModelStates: {},
        explorerChartInsightNames: ['insight'],
        explorerActiveInsightName: 'insight',
        explorerInsightStates: {
          insight: { type: 'scatter', props: {}, interactions: [], typePropsCache: {}, isNew: true },
        },
      });
      render(<ExplorationBuildRail />);
      await screen.findByTestId('exploration-build-rail');
      expect(useStore.getState().explorerChartInsightNames).toEqual(['insight']);
    });

    it('a suggested name that collides with an existing object falls back to a disambiguated one', async () => {
      useStore.setState({
        explorerModelTabs: ['model'],
        explorerModelStates: { model: { isNew: true, sourceName: 'orders_db' } },
        models: [{ name: 'orders_db_query' }],
        defaults: { source_name: 'orders_db' },
      });
      render(<ExplorationBuildRail />);
      await waitFor(() => {
        expect(useStore.getState().explorerModelTabs).toEqual(['orders_db_query_2']);
      });
    });
  });
});
