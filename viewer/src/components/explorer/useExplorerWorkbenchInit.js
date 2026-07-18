import { useEffect, useLayoutEffect, useRef } from 'react';
import useStore from '../../stores/store';
import { fetchSourceSchemaJobs } from '../../api/sourceSchemaJobs';

/**
 * useExplorerWorkbenchInit — the mount-time + reactive init/lifecycle effects
 * shared by every host of the legacy Explorer bundle: the standalone
 * `/explorer` route (`ExplorerPage`) AND the Explore 2.0 in-shell exploration
 * pane (`ExplorationWorkbench`, `/workspace/exploration/:id`).
 *
 * Extracted verbatim from `ExplorerPage.jsx` so both hosts run IDENTICAL init
 * logic — a second, independently-evolving copy is exactly the "fork" the
 * delivery plan's Phase 2 scoping note forbids ("study how ExplorerPage
 * composes them and what init/lifecycle it runs; reuse via a wrapper, do not
 * fork logic").
 *
 * Runs:
 *   - fetch `explorerSources` on mount if empty (see the dedicated note
 *     below — this is a Phase 3a addition, not part of the original
 *     extraction);
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
 *
 * Phase 3a regression fix (VIS-1053): `explorerSources` used to be populated
 * ONLY as a side effect of `ExplorerLeftPanel`'s nested `SourceBrowser`
 * mounting (`SourceBrowser.onSourcesLoaded` -> `ExplorerLeftPanel`'s
 * `handleSourcesLoaded` -> `setExplorerSources`) — true for the standalone
 * route (still mounts `ExplorerLeftPanel`), but Phase 3a's DnD unification
 * removed `ExplorerLeftPanel` from `ExplorationWorkbench` entirely (the
 * Library is now the browse surface). That silently starved
 * `explorerSources` to `[]` forever in the new surface, which in turn starved
 * the auto-create-model-tab effect below (its `explorerSources.length > 0`
 * guard never became true) — no query ever auto-created, `CenterPanel`'s
 * source selector stuck on "Select source." Fetching directly in this
 * SHARED init hook (rather than depending on a browse-panel component
 * happening to be mounted) fixes both hosts at once and removes that
 * component-render dependency entirely.
 */
export default function useExplorerWorkbenchInit() {
  const modelTabs = useStore(s => s.explorerModelTabs);
  const explorerSources = useStore(s => s.explorerSources);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const createModelTab = useStore(s => s.createModelTab);
  const createInsight = useStore(s => s.createInsight);
  const fetchDefaults = useStore(s => s.fetchDefaults);
  const fetchExplorerDiff = useStore(s => s.fetchExplorerDiff);
  const setExplorerSources = useStore(s => s.setExplorerSources);

  // Populate explorerSources on mount if not already loaded — see the Phase
  // 3a regression note above. Guarded on length so re-mounting this hook for
  // a DIFFERENT exploration (switching tabs) doesn't keep re-fetching once a
  // session already has sources cached; the sandbox's project sources don't
  // change mid-session.
  const explorerSourcesLength = explorerSources.length;
  useEffect(() => {
    if (explorerSourcesLength > 0) return undefined;
    let cancelled = false;
    fetchSourceSchemaJobs()
      .then(data => {
        if (!cancelled) setExplorerSources(data || []);
      })
      .catch(() => {
        /* best-effort — mirrors SourceBrowser's own console-only error handling */
      });
    return () => {
      cancelled = true;
    };
  }, [explorerSourcesLength, setExplorerSources]);

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
  // sources are available. `useLayoutEffect` (not `useEffect`): this closes a
  // real data-loss race (Explore 2.0 Phase 2) — `setActiveModelSql` /
  // `setActiveModelSource` (explorerStore.js) silently no-op an edit when
  // there's no active model yet, so any interaction landing in the window
  // between mount and this effect firing was SILENTLY DROPPED. A layout
  // effect runs synchronously before the browser paints, so whenever sources
  // are already available (the common case — a prior fetch this session), a
  // model tab exists before the workbench is ever interactable, closing the
  // window entirely. It doesn't help the very first cold load (sources
  // haven't arrived over the network yet regardless of effect timing), but
  // no real user — or test — can interact with the UI before it paints.
  useLayoutEffect(() => {
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
