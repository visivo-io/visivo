import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormTextarea, FormSelect, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from './RefTextArea';

/**
 * DimensionEditForm - Form component for editing/creating dimensions
 *
 * Dimensions can be either:
 * 1. Model-scoped: Attached to a specific model, plain SQL expression (no refs)
 * 2. Project-level (multi-model): Standalone, can use refs to reference models/dimensions
 *
 * Props:
 * - dimension: Dimension object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const DimensionEditForm = ({ dimension, isCreate, onClose, onSave }) => {
  const { saveDimension, deleteDimension, checkPublishStatus, models, saveModel, fetchModels } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [parentModel, setParentModel] = useState(''); // Empty string = project-level (multi-model)
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!dimension && !isCreate;
  const isNewObject = dimension?.status === ObjectStatus.NEW;
  const isModelScoped = !!parentModel;

  // Initialize form when dimension changes
  useEffect(() => {
    if (dimension) {
      // Edit mode - populate from existing dimension
      setName(dimension.name || '');
      setExpression(dimension.config?.expression || '');
      setDescription(dimension.config?.description || '');
      setParentModel(dimension.parentModel || '');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setExpression('');
      setDescription('');
      setParentModel('');
    }
    setErrors({});
    setSaveError(null);
  }, [dimension, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      newErrors.name =
        'Name must start with a letter and contain only letters, numbers, underscores, and hyphens';
    }

    if (!expression.trim()) {
      newErrors.expression = 'Expression is required';
    } else if (isModelScoped) {
      // Model-scoped dimensions cannot contain ref() expressions
      const refPattern = /\$\{\s*ref\s*\(/;
      if (refPattern.test(expression)) {
        newErrors.expression = 'Model-scoped dimensions cannot use ref() expressions. Use plain SQL referencing fields from the parent model.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    try {
      if (isModelScoped) {
        // Save as model-scoped dimension - update the parent model
        const model = models.find(m => m.name === parentModel);
        if (!model) {
          setSaveError(`Model "${parentModel}" not found`);
          setSaving(false);
          return;
        }

        // Build updated dimensions list
        const existingDimensions = model.config?.dimensions || [];
        const newDimension = {
          name,
          expression,
          description: description || undefined,
        };

        // Replace or add the dimension
        const dimensionIndex = existingDimensions.findIndex(d => d.name === name);
        let updatedDimensions;
        if (dimensionIndex >= 0) {
          updatedDimensions = [...existingDimensions];
          updatedDimensions[dimensionIndex] = newDimension;
        } else {
          updatedDimensions = [...existingDimensions, newDimension];
        }

        // Update the model with new dimensions
        const updatedConfig = {
          ...model.config,
          name: model.name,
          sql: model.sql || model.config?.sql,
          dimensions: updatedDimensions,
        };

        const result = await saveModel(parentModel, updatedConfig);
        await fetchModels();

        if (result?.success) {
          onSave && onSave(newDimension);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save dimension to model');
        }
      } else {
        // Save as project-level dimension
        const config = {
          name,
          expression,
          description: description || undefined,
        };

        const result = await saveDimension(name, config);

        if (result?.success) {
          onSave && onSave(config);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save dimension');
        }
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save dimension');
    }

    setSaving(false);
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
        <FormInput
          id="dimensionName"
          label="Dimension Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isEditMode}
          required
          error={errors.name}
        />

        <FormSelect
          id="parentModel"
          label="Parent Model"
          value={parentModel}
          onChange={e => {
            setParentModel(e.target.value);
            // Clear expression errors when switching modes
            if (errors.expression) {
              setErrors(prev => ({ ...prev, expression: null }));
            }
          }}
          helperText={
            isModelScoped
              ? 'This dimension will be scoped to the selected model and use plain SQL.'
              /* eslint-disable-next-line no-template-curly-in-string */
              : 'This dimension can reference multiple models using ${ref(model_name)}.'
          }
        >
          <option value="">Multi-model (project-level)</option>
          {models.map(model => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))}
        </FormSelect>

        <RefTextArea
          value={expression}
          onChange={setExpression}
          label="Expression"
          required
          error={errors.expression}
          allowedTypes={isModelScoped ? [] : ['model', 'dimension']}
          hideAddButton={isModelScoped}
          rows={4}
          helperText={
            isModelScoped
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
