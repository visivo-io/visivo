import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import createEditorSlice from './editorStore';
import createExplorerSlice from './explorerStore';
import createCommonSlice from './commonStore';
import createProjectSlice from './projectStore';
import createSelectorSlice from './selectorStore';
import createInsightSlice from './insightStore';
import createWorksheetSlice from './worksheetStore';

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
    ...createProjectSlice(...a),
    ...createSelectorSlice(...a),
    ...createInsightSlice(...a),
    ...createWorksheetSlice(...a),
    ...persist(createCommonSlice, {
      name: 'common-storage',
      partialize: state => ({ scrollPositions: state.scrollPositions }),
    })(...a),
  }))
);

export default useStore;
