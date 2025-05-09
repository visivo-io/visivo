import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import createEditorSlice from './editorStore';
import createExplorerSlice from './explorerStore';
import createCommonSlice from './commonStore';

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
    ...createCommonSlice(...a),
  }))
);

export default useStore;
