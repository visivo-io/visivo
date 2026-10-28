import { useEffect, useLayoutEffect, useRef } from 'react';
import useStore from '../../stores/store';
import { explorerSourcesFromLibrary, sameExplorerSources } from '../../stores/explorerStore';

/**
 * useExplorerWorkbenchInit — the mount-time + reactive init/lifecycle effects
 * for the Explore 2.0 in-shell exploration pane (`ExplorationWorkbench`,
 * `/workspace/exploration/:id`).
 *
 * Originally extracted verbatim from the standalone `/explorer` route's
 * `ExplorerPage.jsx` (retired at the Phase 3b cutover — `/explorer` is now a
 * permanent redirect into the Workspace shell) so both hosts ran IDENTICAL
 * init logic during the phases both surfaces coexisted. `ExplorationWorkbench`
 * is this hook's only consumer now.
 *
 * Runs:
 *   - keep `explorerSources` in step with the Library's source list, drafts
 *     included (VIS-1550);
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
 * VIS-1082 (cold-session default-source race): the auto-create-model-tab
 * effect below is a `useLayoutEffect` gated only on sources being available —
 * it has no dependency on `state.defaults`, which is fetched by a separate,
 * later-declared, plain `useEffect` with no ordering guarantee relative to
 * the sources fetch. On a cold session (nothing cached yet), sources can
 * arrive before defaults do, so the very first auto-created model tab can
 * silently resolve to "first available source" instead of the project's
 * configured default — a WRONG source with no visible error. Rather than
 * blocking tab creation on `fetchDefaults()` (which would reopen the exact
 * data-loss race the layout effect exists to close, per the note on that
 * effect below), this hook remembers whether `defaults` had already arrived
 * at the moment it auto-created a tab; if not, a dedicated effect rebinds
 * that tab's source once `defaults` actually lands (`applyResolvedDefaultSource`,
 * explorerStore.js — a no-op if the user has since picked a source
 * themselves).
 *
 * `explorerSources` is derived from the Library's `sources` (the Workspace
 * fetches them on mount and after every save, commit and discard), so a source
 * saved but not yet committed is selectable here as soon as the Library shows
 * it (VIS-1550).
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
  const defaults = useStore(s => s.defaults);
  const applyResolvedDefaultSource = useStore(s => s.applyResolvedDefaultSource);
  const librarySources = useStore(s => s.sources);

  useEffect(() => {
    const next = explorerSourcesFromLibrary(librarySources);
    if (!sameExplorerSources(next, useStore.getState().explorerSources)) {
      setExplorerSources(next);
    }
  }, [librarySources, setExplorerSources]);

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
  // VIS-1082: remembers the auto-created tab's name ONLY when `defaults`
  // hadn't arrived yet at creation time — the one case that needs a later
  // rebind. `null` once resolved (or if defaults were already in by creation
  // time, in which case createModelTab already picked the right source).
  const pendingDefaultSourceTabRef = useRef(null);
  // VIS-1228: this must create AT MOST ONE tab per mount. Two guards, because
  // the original single `modelTabs.length === 0` check was neither:
  //   1. `modelAutoCreatedRef` — StrictMode runs a layout effect's setup TWICE
  //      on mount (no re-render between the two runs), and the closure
  //      `modelTabs.length` is still 0 on the second run even though the first
  //      already added a tab, so `createModelTab()` fired twice → a brand-new
  //      exploration opened with the strip's sources already cached got two
  //      queries (`model` + `model_2`). The sibling insight effect below has
  //      always had this exact ref guard; this one was missing it.
  //   2. a LIVE `explorerModelTabs.length` read — belt-and-suspenders against
  //      the same stale-closure fragility on any non-StrictMode re-run.
  const modelAutoCreatedRef = useRef(false);
  useLayoutEffect(() => {
    if (modelAutoCreatedRef.current) return;
    if (explorerSources.length === 0) return;
    if (useStore.getState().explorerModelTabs.length > 0) return;
    modelAutoCreatedRef.current = true;
    const defaultsAlreadyArrived = !!useStore.getState().defaults;
    const createdName = createModelTab();
    if (!defaultsAlreadyArrived) {
      pendingDefaultSourceTabRef.current = createdName;
    }
  }, [modelTabs.length, explorerSources.length, createModelTab]);

  // VIS-1082: once `defaults` lands, rebind the tab that was auto-created
  // before it arrived (a no-op — see `applyResolvedDefaultSource` — if the
  // user already picked a source themselves in the meantime).
  useEffect(() => {
    if (!defaults || !pendingDefaultSourceTabRef.current) return;
    applyResolvedDefaultSource(pendingDefaultSourceTabRef.current, defaults.source_name);
    pendingDefaultSourceTabRef.current = null;
  }, [defaults, applyResolvedDefaultSource]);

  // A query tab seeded before `defaults` or the source list had loaded (e.g.
  // "Explore" from the Semantic Layer on a cold session) has no source yet.
  // Resolve it the way `createModelTab` would, once `defaults` is known.
  useEffect(() => {
    if (!defaults) return;
    const fallback = defaults.source_name || explorerSources[0]?.source_name;
    if (!fallback) return;
    const states = useStore.getState().explorerModelStates || {};
    Object.entries(states).forEach(([name, modelState]) => {
      if (modelState && !modelState.sourceName && !modelState.sourceEdited) {
        applyResolvedDefaultSource(name, fallback);
      }
    });
  }, [defaults, explorerSources, modelTabs, applyResolvedDefaultSource]);

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
