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
import createPublishSlice from './publishStore';
import createDefaultsSlice from './defaultsStore';
import createDashboardSlice from './dashboardStore';
import createCsvScriptModelSlice from './csvScriptModelStore';
import createLocalMergeModelSlice from './localMergeModelStore';
import createExplorerNewSlice from './explorerNewStore';
import createModelJobsSlice from './modelJobsStore';
import createWorkspaceSlice from './workspaceStore';
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
    ...createPublishSlice(...a),
    ...createDefaultsSlice(...a),
    ...createDashboardSlice(...a),
    ...createCsvScriptModelSlice(...a),
    ...createLocalMergeModelSlice(...a),
    ...createExplorerNewSlice(...a),
    ...createModelJobsSlice(...a),
    ...createWorkspaceSlice(...a),
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

export default useStore;
