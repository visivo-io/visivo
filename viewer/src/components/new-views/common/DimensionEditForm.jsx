import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormTextarea, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from './RefTextArea';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { validateName } from './namedModel';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { getTypeByValue } from './objectTypeConfigs';

/**
 * DimensionEditForm - Form component for editing/creating dimensions
 *
 * Dimensions can be either:
 * 1. Project-level (multi-model): Created via + button, can use refs to reference models/dimensions
 * 2. Embedded: Inline dimension within a model (uses _embedded metadata), plain SQL only
 *
 * Props:
 * - dimension: Dimension object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save (type, name, config)
 * - onGoBack: Callback to navigate back to parent (for embedded dimensions)
 */
const DimensionEditForm = ({ dimension, isCreate, onClose, onSave, onGoBack }) => {
  const { saveDimension, deleteDimension, checkPublishStatus } = useStore();

  // Detect embedded mode (inline dimension within a model)
  const isEmbedded = isEmbeddedObject(dimension);
  const parentName = dimension?._embedded?.parentName;

  // Form state
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // For embedded dimensions, we allow name editing since they're being created inline
  // For standalone dimensions, name is read-only in edit mode
  const isEditMode = !!dimension && !isCreate && !isEmbedded;
  const isNewObject = dimension?.status === ObjectStatus.NEW;

  // Initialize form when dimension changes
  useEffect(() => {
    if (dimension) {
      // Edit mode - populate from existing dimension
      // For embedded dimensions, get name from config.name (it's the actual dimension name)
      const dimName = dimension.config?.name || dimension.name || '';
      setName(dimName);
      setExpression(dimension.config?.expression || '');
      setDescription(dimension.config?.description || '');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setExpression('');
      setDescription('');
    }
    setErrors({});
    setSaveError(null);
  }, [dimension, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!expression.trim()) {
      newErrors.expression = 'Expression is required';
    } else if (isEmbedded) {
      // Embedded (inline) dimensions cannot contain ref() expressions
      const refPattern = /\$\{\s*ref\s*\(/;
      if (refPattern.test(expression)) {
        newErrors.expression =
          'Inline dimensions cannot use ref() expressions. Use plain SQL referencing fields from the parent model.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    // Build the dimension config
    const config = {
      name,
      expression,
      description: description || undefined,
    };

    try {
      if (isEmbedded) {
        // Embedded dimension - use unified save callback
        // Parent will handle updating the stack via applyToParent
        const result = await onSave('dimension', name, config);
        setSaving(false);
        if (!result?.success) {
          setSaveError(result?.error || 'Failed to save dimension');
        }
        // Parent handles panel close on success
      } else {
        // Save as project-level dimension (always multi-model)
        const result = await saveDimension(name, config);

        setSaving(false);
        if (result?.success) {
          onSave && onSave(config);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save dimension');
        }
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save dimension');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteDimension(dimension.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete dimension');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <FormLayout>
        {/* Embedded dimension back navigation */}
        {isEmbedded && onGoBack && (() => {
          const parentTypeConfig = getTypeByValue('model');
          const ParentIcon = parentTypeConfig?.icon;
          return (
            <button
              type="button"
              onClick={onGoBack}
              className={`w-full flex items-center gap-2 px-3 py-2 mb-4 rounded-md border transition-colors ${parentTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${parentTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
            >
              <ChevronLeftIcon fontSize="small" className={parentTypeConfig?.colors?.text || 'text-gray-600'} />
              {ParentIcon && <ParentIcon fontSize="small" className={parentTypeConfig?.colors?.text || 'text-gray-600'} />}
              <span className={`text-sm font-medium ${parentTypeConfig?.colors?.text || 'text-gray-700'}`}>
                Model {parentName}
              </span>
            </button>
          );
        })()}

        <FormInput
          id="dimensionName"
          label="Dimension Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isEditMode}
          required
          error={errors.name}
        />

        <RefTextArea
          value={expression}
          onChange={setExpression}
          label="Expression"
          required
          error={errors.expression}
          allowedTypes={isEmbedded ? [] : ['model', 'dimension']}
          hideAddButton={isEmbedded}
          rows={4}
          helperText={
            isEmbedded
              ? 'Plain SQL expression referencing columns from the parent model.'
              : 'SQL expression for this dimension. Use the + button to insert references.'
          }
        />

        <FormTextarea
          id="dimensionDescription"
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
        />

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
      </FormLayout>

      <FormFooter
        onCancel={onClose}
        onSave={handleSave}
        saving={saving}
        showDelete={isEditMode && !showDeleteConfirm}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        deleteConfirm={
          showDeleteConfirm && isEditMode
            ? {
                show: true,
                message: isNewObject
                  ? 'Are you sure you want to delete this dimension? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this dimension? This will mark it for deletion and remove it from YAML when you publish.',
                onConfirm: handleDelete,
                onCancel: () => setShowDeleteConfirm(false),
                deleting,
              }
            : null
        }
      />
    </>
  );
};

export default DimensionEditForm;
