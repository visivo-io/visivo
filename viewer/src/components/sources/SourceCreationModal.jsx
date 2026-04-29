import React from 'react';
import { HiX } from 'react-icons/hi';
import SourceEditForm from '../new-views/common/SourceEditForm';
import useSourceModalStore, {
  useSourceCreationModal,
} from '../../stores/sourceModalStore';
import useStore from '../../stores/store';

/**
 * SourceCreationModal — App-level source-creation modal.
 *
 * Rendered once at the app level (mounted in Home.jsx) and toggled via
 * `useSourceCreationModal().open()`. Wraps the existing SourceEditForm in
 * a centered overlay so any view can trigger source creation without
 * re-implementing modal chrome.
 *
 * Save behavior:
 *   - Default: saves through the store's `saveSource` action
 *     (POST /api/sources/<name>/save/) and refreshes the sources list.
 *   - Override: callers may pass `{ onSave }` to `open()` to inject a
 *     custom save flow (used by Onboarding for the project-finalize path).
 *   - On successful save, optional `onSaveSuccess` callback is invoked
 *     before the modal closes.
 */
export default function SourceCreationModal() {
  const { isOpen, close } = useSourceCreationModal();
  const onSaveOverride = useSourceModalStore(s => s.onSaveOverride);
  const onSaveSuccess = useSourceModalStore(s => s.onSaveSuccess);
  const saveSource = useStore(s => s.saveSource);
  const fetchSources = useStore(s => s.fetchSources);

  if (!isOpen) return null;

  const handleSave = async (type, name, config) => {
    let result;
    if (onSaveOverride) {
      result = await onSaveOverride(type, name, config);
    } else {
      result = await saveSource(name, config);
      // Refresh sources list so consumers see the new source
      try {
        await fetchSources();
      } catch (err) {
        // fetchSources sets its own error state; don't block save success
      }
    }

    if (result?.success) {
      if (onSaveSuccess) {
        try {
          await onSaveSuccess();
        } catch (err) {
          // Surface failures but don't keep the modal open on a callback error
        }
      }
      close();
    }
    return result;
  };

  return (
    <div
      data-testid="source-creation-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-creation-modal-title"
      >
        <button
          onClick={close}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <HiX className="h-5 w-5" />
        </button>
        <div className="p-6">
          <h2
            id="source-creation-modal-title"
            className="mb-4 text-xl font-semibold text-gray-900"
          >
            Add Data Source
          </h2>
          <SourceEditForm isCreate onClose={close} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
