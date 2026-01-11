import React from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Button, ButtonOutline } from './Button';

/**
 * FormFooter - Fixed footer with action buttons for edit forms
 *
 * Features:
 * - Fixed position at bottom of form
 * - Cancel and Save buttons with loading state
 * - Optional delete button (edit mode only)
 * - Integrated delete confirmation
 * - Optional left actions (additional buttons on left side)
 *
 * Props:
 * - onCancel: Cancel button click handler
 * - onSave: Save button click handler
 * - saving: Whether save is in progress
 * - showDelete: Whether to show delete button
 * - onDeleteClick: Delete button click handler
 * - deleteConfirm: Delete confirmation state object { show, message, onConfirm, onCancel, deleting }
 * - saveLabel: Custom save button label (default: "Save")
 * - cancelLabel: Custom cancel button label (default: "Cancel")
 * - leftActions: Optional additional buttons/elements to render on the left side
 */
const FormFooter = ({
  onCancel,
  onSave,
  saving = false,
  showDelete = false,
  onDeleteClick,
  deleteConfirm,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  leftActions,
}) => {
  return (
    <div className="border-t border-gray-200 bg-gray-50">
      {/* Delete Confirmation */}
      {deleteConfirm?.show && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700 mb-2">{deleteConfirm.message}</p>
          <div className="flex gap-2">
            <button
              onClick={deleteConfirm.onCancel}
              disabled={deleteConfirm.deleting}
              className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={deleteConfirm.onConfirm}
              disabled={deleteConfirm.deleting}
              className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deleteConfirm.deleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex gap-2">
          {/* Left actions (e.g., Test Connection button) */}
          {leftActions}
          {/* Delete button */}
          {showDelete && !deleteConfirm?.show && (
            <button
              type="button"
              onClick={onDeleteClick}
              className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <DeleteOutlineIcon fontSize="small" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <ButtonOutline type="button" onClick={onCancel} className="text-sm">
            {cancelLabel}
          </ButtonOutline>
          <Button type="button" onClick={onSave} disabled={saving} className="text-sm">
            {saving ? (
              <>
                <CircularProgress size={14} className="mr-1" style={{ color: 'white' }} />
                Saving...
              </>
            ) : (
              saveLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FormFooter;
