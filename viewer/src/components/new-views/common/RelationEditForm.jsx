import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

/**
 * RelationEditForm - Form component for editing/creating relations
 *
 * Props:
 * - relation: Relation object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const RelationEditForm = ({ relation, isCreate, onClose, onSave }) => {
  const { saveRelation, deleteRelation, checkPublishStatus } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [modelRef, setModelRef] = useState('');
  const [joinType, setJoinType] = useState('left');
  const [sqlOn, setSqlOn] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!relation && !isCreate;
  const isNewObject = relation?.status === ObjectStatus.NEW;

  // Initialize form when relation changes
  useEffect(() => {
    if (relation) {
      // Edit mode - populate from existing relation
      setName(relation.name || '');
      setModelRef(relation.config?.model || '');
      setJoinType(relation.config?.join_type || 'left');
      setSqlOn(relation.config?.sql_on || '');
      setDescription(relation.config?.description || '');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setModelRef('');
      setJoinType('left');
      setSqlOn('');
      setDescription('');
    }
    setErrors({});
    setSaveError(null);
  }, [relation, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      newErrors.name =
        'Name must start with a letter and contain only letters, numbers, underscores, and hyphens';
    }

    if (!modelRef.trim()) {
      newErrors.modelRef = 'Model reference is required';
    }

    if (!sqlOn.trim()) {
      newErrors.sqlOn = 'Join condition (sql_on) is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    const config = {
      name,
      model: modelRef,
      join_type: joinType,
      sql_on: sqlOn,
      description: description || undefined,
    };

    const result = await saveRelation(name, config);

    setSaving(false);

    if (result?.success) {
      onSave && onSave(config);
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to save relation');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteRelation(relation.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete relation');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-5">
        {/* Name field */}
        <div className="relative">
          <input
            type="text"
            id="relationName"
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
            htmlFor="relationName"
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            Relation Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        {/* Model Reference */}
        <div className="relative">
          <input
            type="text"
            id="relationModelRef"
            value={modelRef}
            onChange={e => setModelRef(e.target.value)}
            placeholder=" "
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent
              ${errors.modelRef ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
            `}
          />
          <label
            htmlFor="relationModelRef"
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors.modelRef ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            Model Reference<span className="text-red-500 ml-0.5">*</span>
          </label>
          {errors.modelRef && <p className="mt-1 text-xs text-red-500">{errors.modelRef}</p>}
        </div>

        {/* Join Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Join Type</label>
          <select
            value={joinType}
            onChange={e => setJoinType(e.target.value)}
            className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="left">Left Join</option>
            <option value="right">Right Join</option>
            <option value="inner">Inner Join</option>
            <option value="full">Full Join</option>
          </select>
        </div>

        {/* Join Condition (sql_on) */}
        <div className="relative">
          <textarea
            id="relationSqlOn"
            value={sqlOn}
            onChange={e => setSqlOn(e.target.value)}
            placeholder=" "
            rows={4}
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900 font-mono
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent resize-y
              ${errors.sqlOn ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
            `}
          />
          <label
            htmlFor="relationSqlOn"
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-3
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors.sqlOn ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            Join Condition (sql_on)<span className="text-red-500 ml-0.5">*</span>
          </label>
          {errors.sqlOn && <p className="mt-1 text-xs text-red-500">{errors.sqlOn}</p>}
        </div>

        {/* Description (optional) */}
        <div className="relative">
          <textarea
            id="relationDescription"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder=" "
            rows={2}
            className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 peer placeholder-transparent resize-y"
          />
          <label
            htmlFor="relationDescription"
            className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-3 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 text-gray-500 peer-focus:text-primary-500"
          >
            Description
          </label>
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
                ? 'Are you sure you want to delete this relation? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this relation? This will mark it for deletion and remove it from YAML when you publish.'}
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
                title="Delete relation"
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

export default RelationEditForm;
