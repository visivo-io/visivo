import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import createEditorSlice from './editorStore';
import createExplorerSlice from './explorerStore';
import createCommonSlice from './commonStore';
import createProjectSlice from './projectStore';
import createSelectorSlice from './selectorStore';

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
    ...createCommonSlice(...a),
    ...createProjectSlice(...a),
    ...createSelectorSlice(...a),
  }))
);

export default useStore;
