import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import createEditorSlice from './editorStore';
import createExplorerSlice from './explorerStore';
import createCommonSlice from './commonStore';
import createProjectSlice from './projectStore';
import createSelectorSlice from './selectorStore';
import createInsightJobsSlice from './insightJobsStore';
import createWorksheetSlice from './worksheetStore';
import createSourceSlice, { ObjectStatus } from './sourceStore';
import createModelSlice from './modelStore';
import createDimensionSlice from './dimensionStore';
import createMetricSlice from './metricStore';
import createRelationSlice from './relationStore';
import createInsightSlice from './insightStore';
import createPublishSlice from './publishStore';

// Re-export ObjectStatus for convenience
export { ObjectStatus };

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
    ...createProjectSlice(...a),
    ...createSelectorSlice(...a),
    ...createInsightJobsSlice(...a),
    ...createWorksheetSlice(...a),
    ...createSourceSlice(...a),
    ...createModelSlice(...a),
    ...createDimensionSlice(...a),
    ...createMetricSlice(...a),
    ...createRelationSlice(...a),
    ...createInsightSlice(...a),
    ...createPublishSlice(...a),
    ...persist(createCommonSlice, {
      name: 'common-storage',
      partialize: state => ({ scrollPositions: state.scrollPositions }),
    })(...a),
  }))
);

export default useStore;
