import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import createCommonSlice from './commonStore';
import createProjectSlice from './projectStore';
import createInsightJobsSlice from './insightJobsStore';
import createSourceSlice, { ObjectStatus } from './sourceStore';
import createModelSlice from './modelStore';
import createDimensionSlice from './dimensionStore';
import createMetricSlice from './metricStore';
import createRelationSlice from './relationStore';
import createInsightSlice from './insightStore';
import createInputSlice from './inputStore';
import createInputJobsSlice from './inputJobsStore';
import createMarkdownSlice from './markdownStore';
import createChartSlice from './chartStore';
import createTableSlice from './tableStore';
import createCommitSlice from './commitStore';
import createBranchingSlice from './branchingStore';
import createRunSlice from './runStore';
import createDefaultsSlice from './defaultsStore';
import createDashboardSlice from './dashboardStore';
import createInlineCreateSlice from './inlineCreateStore';
import createExplorerSlice from './explorerStore';
import createModelJobsSlice from './modelJobsStore';
import createWorkspaceSlice from './workspaceStore';
import createWorkspaceErdLayoutSlice from './workspaceErdLayoutStore';
import createLibraryPrefsSlice from './libraryPrefsStore';

// Re-export ObjectStatus for convenience
export { ObjectStatus };

const useStore = create(
  devtools((...a) => ({
    ...createProjectSlice(...a),
    ...createInsightJobsSlice(...a),
    ...createSourceSlice(...a),
    ...createModelSlice(...a),
    ...createDimensionSlice(...a),
    ...createMetricSlice(...a),
    ...createRelationSlice(...a),
    ...createInsightSlice(...a),
    ...createInputSlice(...a),
    ...createInputJobsSlice(...a),
    ...createMarkdownSlice(...a),
    ...createChartSlice(...a),
    ...createTableSlice(...a),
    ...createCommitSlice(...a),
    ...createBranchingSlice(...a),
    ...createRunSlice(...a),
    ...createDefaultsSlice(...a),
    ...createDashboardSlice(...a),
    ...createInlineCreateSlice(...a),
    ...createExplorerSlice(...a),
    ...createModelJobsSlice(...a),
    ...createWorkspaceSlice(...a),
    // Session-only ERD layout (dragged node positions + pill waypoints), kept
    // OUTSIDE persist() — ephemeral view state, not config.
    ...createWorkspaceErdLayoutSlice(...a),
    // Persisted slices — Zustand 5's `persist` middleware can only be applied
    // once per store API (calling it twice at the same level silently breaks
    // the second). We compose every persisted slice into a single `persist`
    // call and partialize-select the keys each slice owns. The storage key
    // stays `common-storage` so existing users' persisted `scrollPositions`
    // entries continue to hydrate cleanly.
    ...persist(
      (set, get, api) => ({
        ...createCommonSlice(set, get, api),
        ...createLibraryPrefsSlice(set, get, api),
      }),
      {
        name: 'common-storage',
        partialize: state => ({
          scrollPositions: state.scrollPositions,
          libraryCollapsedSections: state.libraryCollapsedSections,
          libraryCollapsedSubsections: state.libraryCollapsedSubsections,
        }),
      }
    )(...a),
  }))
);

// Expose the store on `window` outside production so end-to-end tests
// (Playwright) can read live state — e.g. the workspace selection and draft
// dashboard levels — without coupling assertions to DOM internals. Guarded so
// production builds never attach a debug handle.
if (
  typeof window !== 'undefined' &&
  !(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production')
) {
  window.useStore = useStore;
}

export default useStore;
