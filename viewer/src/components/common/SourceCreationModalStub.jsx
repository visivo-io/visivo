import React from 'react';
import { HiX } from 'react-icons/hi';
import SourceEditForm from '../new-views/common/SourceEditForm';
import useStore from '../../stores/store';
import { useSourceCreationModal } from '../../stores/sourceModalStore';

/**
 * SourceCreationModalStub - App-level stub modal for source creation.
 *
 * Renders when `useSourceCreationModal().isOpen` is true and wraps the
 * existing SourceEditForm so empty-state CTAs across the viewer have a
 * working flow today. A follow-up branch will replace this stub with a
 * dedicated SourceCreationModal component while keeping the same store
 * contract (open / close).
 *
 * This component reuses the modal-overlay pattern from Onboarding.jsx so
 * styling stays consistent.
 */
const SourceCreationModalStub = () => {
  const { isOpen, close } = useSourceCreationModal();
  const saveSource = useStore(state => state.saveSource);
  const fetchSources = useStore(state => state.fetchSources);

  if (!isOpen) {
    return null;
  }

  const handleSave = async (_type, name, config) => {
    const result = await saveSource(name, config);
    if (result?.success) {
      // Refresh sources so the new source appears immediately in lists.
      await fetchSources();
      close();
    }
    return result;
  };

  return (
    <div
      data-testid="source-creation-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={close}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
          data-testid="source-creation-modal-close"
        >
          <HiX className="h-5 w-5" />
        </button>
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Add Data Source</h2>
          <SourceEditForm isCreate onClose={close} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
};

export default SourceCreationModalStub;
