import React, { useState, useEffect, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useFormBaseline from '../../../hooks/useFormBaseline';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { validateName } from './namedModel';
import Select from '../../common/Select';
import useRecordSave from '../../../hooks/useRecordSave';

/**
 * MarkdownEditForm - Form component for editing/creating markdowns
 *
 * Markdowns define text content with alignment options.
 *
 * Props:
 * - markdown: Markdown object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 *
 * The markdown panel uses an EXPLICIT Save (no auto-save): edits buffer locally
 * and persist only on the Save button. In EDIT mode the save flushes through
 * the unified `useRecordSave('markdown', …)` backbone (`saveNow`) rather than
 * calling `saveMarkdown` directly — that writes the config into the record's
 * store collection OPTIMISTICALLY and persists the CURRENT store value at fire
 * time, so this form and the markdown editor canvas share one optimistic store
 * and can't clobber each other. CREATE mode keeps the direct `saveMarkdown`
 * call — the record isn't in the collection yet, so there's nothing to update.
 */
const MarkdownEditForm = ({ markdown, isCreate, onClose, onSave }) => {
  const { saveMarkdown, deleteMarkdown, checkCommitStatus } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [align, setAlign] = useState('left');
  const [justify, setJustify] = useState('start');

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!markdown && !isCreate;
  const isNewObject = markdown?.status === ObjectStatus.NEW;

  // Unified optimistic save backbone (VIS-1018 step 2) — `saveNow` shares the
  // same optimistic store as the editor canvas so the two can't clobber each
  // other. `gateErrors` surfaces the validation-gate's own errors.
  const { saveNow, errors: gateErrors } = useRecordSave('markdown', markdown?.name || null);

  const gateErrorText =
    gateErrors && gateErrors.length > 0
      ? gateErrors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ')
      : null;

  // The values that constitute "the saved markdown", as form state — a shared
  // baseline so Discard reverts to the last save and Save is gated on real
  // edits (matching the chart/insight panels).
  const applyValues = useCallback(values => {
    setName(values.name);
    setContent(values.content);
    setAlign(values.align);
    setJustify(values.justify);
  }, []);
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues);

  // Initialize form when markdown changes
  useEffect(() => {
    if (markdown) {
      seed({
        name: markdown.name || '',
        content: markdown.config?.content || markdown.content || '',
        align: markdown.config?.align || markdown.align || 'left',
        justify: markdown.config?.justify || markdown.justify || 'start',
      });
    } else if (isCreate) {
      seed({ name: '', content: '', align: 'left', justify: 'start' });
    }
    setErrors({});
    setSaveError(null);
    // Re-seeding on `seed` would wipe the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, isCreate]);

  const dirty = isDirtyAgainst({ name, content, align, justify });

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!content.trim()) {
      newErrors.content = 'Content is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    try {
      const config = { name, content, align, justify };

      // Edit mode persists through the optimistic backbone (shared with the
      // canvas) and STAYS OPEN — like the chart/insight panels. Create mode
      // writes the new record directly and closes the tab.
      const result = isEditMode ? await saveNow(config) : await saveMarkdown(name, config);

      if (result?.success) {
        onSave && onSave(config);
        if (!isEditMode) onClose();
      } else {
        setSaveError(result?.error || 'Failed to save markdown');
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save markdown');
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteMarkdown(markdown.name);
    setDeleting(false);

    if (result?.success) {
      await checkCommitStatus();
      // Optional: the right rail supplies it to close the tab, a modal host
      // to dismiss itself. Calling it unguarded threw when neither did.
      onClose?.();
    } else {
      setSaveError(result?.error || 'Failed to delete markdown');
      setShowDeleteConfirm(false);
    }
  };

  // Alignment options
  const ALIGN_OPTIONS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ];

  const JUSTIFY_OPTIONS = [
    { value: 'start', label: 'Start' },
    { value: 'end', label: 'End' },
    { value: 'center', label: 'Center' },
    { value: 'between', label: 'Between' },
    { value: 'around', label: 'Around' },
    { value: 'evenly', label: 'Evenly' },
  ];

  return (
    <>
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Basic Fields Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Basic Information
            </h3>

            {/* Name field */}
            <div className="relative">
              <input
                type="text"
                id="markdownName"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isEditMode}
                placeholder=" "
                className={`
                  block w-full px-3 py-2.5 text-sm text-gray-900
                  bg-white rounded-md border appearance-none
                  focus:outline-none focus:ring-2 focus:border-primary-500
                  peer placeholder-transparent
                  ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}
                  ${errors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
                `}
              />
              <label
                htmlFor="markdownName"
                className={`
                  absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                  bg-white px-1 left-2
                  peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                  peer-placeholder-shown:top-1/2
                  peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                  ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
                `}
              >
                Markdown Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
          </div>

          {/* Content Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Markdown Content
            </h3>

            {/* Content field */}
            <div className="relative">
              <textarea
                id="markdownContent"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder=" "
                rows={10}
                className={`block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border appearance-none focus:outline-none focus:ring-2 focus:border-primary-500 peer placeholder-transparent resize-y font-mono ${errors.content ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}`}
              />
              <label
                htmlFor="markdownContent"
                className={`absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-3 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 ${errors.content ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}`}
              >
                Content<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content}</p>}
              <p className="mt-1 text-xs text-gray-500">
                Supports CommonMark and GitHub Flavored Markdown
              </p>
            </div>
          </div>

          {/* Alignment Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Alignment Options
            </h3>

            {/* Horizontal Alignment */}
            <div className="relative">
              <Select
                id="markdownAlign"
                aria-label="Horizontal Alignment"
                value={align}
                options={ALIGN_OPTIONS}
                onChange={v => setAlign(v)}
              />
              <label
                htmlFor="markdownAlign"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Horizontal Alignment
              </label>
            </div>

            {/* Vertical Justify */}
            <div className="relative">
              <Select
                id="markdownJustify"
                aria-label="Vertical Distribution"
                value={justify}
                options={JUSTIFY_OPTIONS}
                onChange={v => setJustify(v)}
              />
              <label
                htmlFor="markdownJustify"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Vertical Distribution
              </label>
            </div>
          </div>

          {/* Save Error */}
          {saveError && <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">{saveError}</div>}
          {gateErrorText && (
            <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm" data-testid="markdown-gate-errors">
              {gateErrorText}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Footer Actions */}
      <div className="border-t border-gray-200 bg-gray-50">
        {/* Delete Confirmation */}
        {showDeleteConfirm && isEditMode && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure you want to delete this markdown? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this markdown? This will mark it for deletion and remove it from YAML when you commit.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center px-4 py-3">
          <div className="flex gap-2">
            {/* Delete button - only in edit mode */}
            {isEditMode && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete markdown"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            )}
          </div>

          {/* Delete · Discard · Save — same footer as the chart/insight panels.
              Edit mode reverts to the last save via Discard (disabled when
              there's nothing to revert); create mode's Cancel closes the tab. */}
          <div className="flex gap-2">
            <ButtonOutline
              type="button"
              onClick={isEditMode ? discard : onClose}
              disabled={isEditMode && (!dirty || saving || deleting)}
              data-testid="markdown-form-discard"
              className="text-sm"
            >
              {isEditMode ? 'Discard' : 'Cancel'}
            </ButtonOutline>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || (isEditMode && !dirty)}
              className="text-sm"
            >
              {saving ? (
                <>
                  <CircularProgress size={14} className="mr-1" style={{ color: 'white' }} />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default MarkdownEditForm;
