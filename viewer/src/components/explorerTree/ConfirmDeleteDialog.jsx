import React from 'react';
import { MdWarning } from 'react-icons/md';

function ConfirmDeleteDialog({ isOpen, onClose, onConfirm, itemName, itemType }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[450px] shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0">
            <MdWarning className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Delete {itemType}?</h2>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to delete <span className="font-semibold">{itemName}</span>?
            </p>
            <p className="text-sm text-gray-600">This action cannot be undone.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteDialog;
