import { useEffect, useRef } from 'react';
import useStore from '../../stores/store';

/**
 * useExplorerWorkbenchInit — the mount-time + reactive init/lifecycle effects
 * shared by every host of the legacy Explorer 3-panel bundle (LeftPanel +
 * CenterPanel + RightPanel under ExplorerDndContext): the standalone
 * `/explorer` route (`ExplorerPage`) AND the Explore 2.0 in-shell exploration
 * pane (`ExplorationWorkbench`, `/workspace/exploration/:id` — Phase 2,
 * specs/plan/explorer-workspace-unification/03-delivery-plan.md).
 *
 * Extracted verbatim from `ExplorerPage.jsx` so both hosts run IDENTICAL init
 * logic — a second, independently-evolving copy is exactly the "fork" the
 * delivery plan's Phase 2 scoping note forbids ("study how ExplorerPage
 * composes them and what init/lifecycle it runs; reuse via a wrapper, do not
 * fork logic").
 *
 * Runs:
 *   - a debounced (300ms) backend diff fetch whenever the working explorer
 *     state changes (`/api/explorer/diff/`);
 *   - fetch project defaults on mount (default source selection);
 *   - auto-create a model tab when the workbench mounts with none open and
 *     sources are available;
 *   - auto-create one insight on first mount only (never re-fires when the
 *     user removes every insight).
 *
 * IMPORTANT for the Workspace host: this hook must only run AFTER any
 * per-exploration state restore has landed (`ExplorationPane`'s snapshot/
 * restore bridge) — otherwise "auto-create when empty" could fire against a
 * transient empty state that's about to be overwritten by the restore. The
 * Workspace host gates mounting `ExplorationWorkbench` (and therefore this
 * hook) on that restore having completed for the current exploration id.
 */
export default function useExplorerWorkbenchInit() {
  const modelTabs = useStore(s => s.explorerModelTabs);
  const explorerSources = useStore(s => s.explorerSources);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const createModelTab = useStore(s => s.createModelTab);
  const createInsight = useStore(s => s.createInsight);
  const fetchDefaults = useStore(s => s.fetchDefaults);
  const fetchExplorerDiff = useStore(s => s.fetchExplorerDiff);

  // Watch explorer state changes to trigger backend diff (debounced).
  const explorerModelStates = useStore(s => s.explorerModelStates);
  const explorerInsightStates = useStore(s => s.explorerInsightStates);
  const explorerChartName = useStore(s => s.explorerChartName);
  const explorerChartLayout = useStore(s => s.explorerChartLayout);

  const diffTimerRef = useRef(null);
  useEffect(() => {
    if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
    diffTimerRef.current = setTimeout(() => {
      fetchExplorerDiff();
    }, 300);
    return () => clearTimeout(diffTimerRef.current);
  }, [
    explorerModelStates,
    explorerInsightStates,
    explorerChartName,
    explorerChartLayout,
    chartInsightNames,
    fetchExplorerDiff,
  ]);

  // Fetch project defaults on mount (needed for default source selection).
  useEffect(() => {
    fetchDefaults();
  }, [fetchDefaults]);

  // Auto-create a model tab when the workbench mounts with none open and
  // sources are available.
  useEffect(() => {
    if (modelTabs.length === 0 && explorerSources.length > 0) {
      createModelTab();
    }
  }, [modelTabs.length, explorerSources.length, createModelTab]);

  // Auto-create an insight on initial mount only (not when the user removes
  // every insight).
  const insightAutoCreated = useRef(false);
  useEffect(() => {
    if (modelTabs.length > 0 && chartInsightNames.length === 0 && !insightAutoCreated.current) {
      insightAutoCreated.current = true;
      createInsight();
    }
  }, [modelTabs.length, chartInsightNames.length, createInsight]);
}
