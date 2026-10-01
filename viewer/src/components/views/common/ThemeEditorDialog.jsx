import React, { useEffect } from 'react';
import { PiX } from 'react-icons/pi';
import { ModalOverlay } from '../../styled/Modal';
import ThemeEditForm from './ThemeEditForm';

const ThemeEditorDialog = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalOverlay
      data-testid="theme-editor-backdrop"
      className="bg-black/30"
      onClick={event => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-editor-title"
        onClick={event => event.stopPropagation()}
        className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 id="theme-editor-title" className="text-sm font-semibold text-gray-900">
              Dashboard theme
            </h2>
            <p className="text-xs text-gray-500">Changes stay a draft until you commit.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <PiX className="h-4 w-4" />
          </button>
        </div>
        <ThemeEditForm />
      </div>
    </ModalOverlay>
  );
};

export default ThemeEditorDialog;
