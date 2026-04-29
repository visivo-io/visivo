import { create } from 'zustand';

/**
 * sourceModalStore — App-level toggle for the source-creation modal.
 *
 * The SourceCreationModal is rendered once at the App level (see Home.jsx)
 * so any view can trigger it via `useSourceCreationModal().open()`.
 *
 * Optional payload on open():
 *   - onSave: (type, name, config) => Promise<{ success, error? }>
 *       Custom save handler. Defaults to the store's `saveSource` action,
 *       which posts to /api/sources/<name>/save/.
 *   - onSaveSuccess: () => void | Promise<void>
 *       Callback invoked after a successful save (after the modal closes).
 *       Useful for triggering downstream flows (e.g. project finalize).
 */
const useSourceModalStore = create(set => ({
  isOpen: false,
  onSaveOverride: null,
  onSaveSuccess: null,

  openSourceModal: (options = {}) =>
    set({
      isOpen: true,
      onSaveOverride: options.onSave || null,
      onSaveSuccess: options.onSaveSuccess || null,
    }),

  closeSourceModal: () =>
    set({
      isOpen: false,
      onSaveOverride: null,
      onSaveSuccess: null,
    }),
}));

export default useSourceModalStore;

/**
 * Convenience hook returning a stable shape for consumers.
 *
 * Returns:
 *   - isOpen: boolean
 *   - open: (options?) => void
 *   - close: () => void
 */
export const useSourceCreationModal = () => {
  const isOpen = useSourceModalStore(s => s.isOpen);
  const open = useSourceModalStore(s => s.openSourceModal);
  const close = useSourceModalStore(s => s.closeSourceModal);
  return { isOpen, open, close };
};
