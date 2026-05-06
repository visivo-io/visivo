import { create } from 'zustand';

/**
 * sourceModalStore — App-level toggle for the source-creation modal.
 *
 * Empty-state CTAs and other entry points open the modal via
 * `useSourceCreationModal().open()`. The modal itself is rendered once at
 * the App level (see Home.jsx) so any view can trigger it.
 *
 * This branch ships a stub modal that wraps the existing SourceEditForm.
 * A follow-up branch will replace the stub with a richer
 * SourceCreationModal component while keeping the same store contract.
 */
const useSourceModalStore = create((set) => ({
  isOpen: false,
  openSourceModal: () => set({ isOpen: true }),
  closeSourceModal: () => set({ isOpen: false }),
}));

export default useSourceModalStore;

/**
 * Convenience hook returning a stable shape for consumers.
 */
export const useSourceCreationModal = () => {
  const isOpen = useSourceModalStore((s) => s.isOpen);
  const open = useSourceModalStore((s) => s.openSourceModal);
  const close = useSourceModalStore((s) => s.closeSourceModal);
  return { isOpen, open, close };
};
