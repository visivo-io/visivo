import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import createEditorSlice from './editorStore';
import createExplorerSlice from './explorerStore';
import createCommonSlice from './commonStore';

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
    ...persist(createCommonSlice, {
      name: 'common-storage',
      partialize: (state) => ({ scrollPositions: state.scrollPositions })
    })(...a)
  }))
);

export default useStore;
