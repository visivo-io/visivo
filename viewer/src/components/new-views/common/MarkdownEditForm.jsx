import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { validateName } from './namedModel';

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
 */
const MarkdownEditForm = ({ markdown, isCreate, onClose, onSave }) => {
  const { saveMarkdown, deleteMarkdown, checkPublishStatus } = useStore();

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

  // Initialize form when markdown changes
  useEffect(() => {
    if (markdown) {
      // Edit mode - populate from existing markdown
      setName(markdown.name || '');
      setContent(markdown.config?.content || markdown.content || '');
      setAlign(markdown.config?.align || markdown.align || 'left');
      setJustify(markdown.config?.justify || markdown.justify || 'start');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setContent('');
      setAlign('left');
      setJustify('start');
    }
    setErrors({});
    setSaveError(null);
  }, [markdown, isCreate]);

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
      // Build config object
      const config = {
        name,
        content,
        align,
        justify,
      };

      const result = await saveMarkdown(name, config);

      if (result?.success) {
        onSave && onSave(config);
        onClose();
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
      await checkPublishStatus();
      onClose();
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
              <select
                id="markdownAlign"
                value={align}
                onChange={e => setAlign(e.target.value)}
                className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {ALIGN_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label
                htmlFor="markdownAlign"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Horizontal Alignment
              </label>
            </div>

            {/* Vertical Justify */}
            <div className="relative">
              <select
                id="markdownJustify"
                value={justify}
                onChange={e => setJustify(e.target.value)}
                className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {JUSTIFY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                : 'Are you sure you want to delete this markdown? This will mark it for deletion and remove it from YAML when you publish.'}
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

          <div className="flex gap-2">
            <ButtonOutline type="button" onClick={onClose} className="text-sm">
              Cancel
            </ButtonOutline>
            <Button type="button" onClick={handleSave} disabled={saving} className="text-sm">
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
