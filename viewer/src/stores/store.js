import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { createEditorSlice } from "./editorStore";
import { createExplorerSlice } from "./explorerStore";

const useStore = create(
  devtools((...a) => ({
    ...createEditorSlice(...a),
    ...createExplorerSlice(...a),
  }))
);

export default useStore;
