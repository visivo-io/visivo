import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';
import { FormInput, FormTextarea, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from './RefTextArea';
import { validateName } from './namedModel';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { getTypeByValue } from './objectTypeConfigs';
import { BackNavigationButton } from '../../styled/BackNavigationButton';

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
  const { saveDimension, deleteDimension, checkCommitStatus } = useStore();

  // VIS-993: edit mode is AUTO-SAVE — every field change debounces through
  // the gated optimistic backbone (no Save button), so schema/ref/expression-
  // invalid configs are blocked BEFORE they persist (no POST, no doomed run)
  // and the gate's errors render live on the fields. Create mode keeps the
  // explicit saveDimension button: the record isn't in the collection yet.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('dimension', dimension?.name || null);

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

  // Build the config the backbone persists; `over` carries the just-typed
  // value so we never read one keystroke behind React state.
  const buildConfig = (over = {}) => {
    const cfg = { name, expression, description: description || undefined, ...over };
    if (cfg.description === undefined) delete cfg.description;
    return cfg;
  };

  const isAutoSave = isEditMode;
  const autoSave = over => {
    if (!isAutoSave) return;
    scheduleSave(buildConfig(over));
  };

  // Gate errors (VIS-993) render live: expression-path errors land on the
  // field, anything else in the form-level alert.
  const gateExpressionError = gateErrors?.find(
    e => e.path === 'expression' || e.path?.startsWith('expression')
  )?.message;
  const gateOtherErrors = (gateErrors || []).filter(
    e => !(e.path === 'expression' || e.path?.startsWith('expression'))
  );

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
        // Create mode only — edit mode auto-saves via scheduleSave.
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
      await checkCommitStatus();
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
        {isEmbedded && onGoBack && (
          <BackNavigationButton
            onClick={onGoBack}
            typeConfig={getTypeByValue('model')}
            label="Model"
            name={parentName}
          />
        )}

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
          onChange={v => {
            setExpression(v);
            autoSave({ expression: v });
          }}
          label="Expression"
          required
          error={errors.expression || gateExpressionError}
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
          onChange={e => {
            setDescription(e.target.value);
            autoSave({ description: e.target.value || undefined });
          }}
          rows={2}
        />

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
        {gateOtherErrors.length > 0 && (
          <FormAlert variant="error">
            {gateOtherErrors.map(e => `${e.path}: ${e.message}`).join('; ')}
          </FormAlert>
        )}
      </FormLayout>

      <FormFooter
        autoSave={isAutoSave}
        rightContent={<SaveStateIndicator status={autoSaveStatus} />}
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
                  : 'Are you sure you want to delete this dimension? This will mark it for deletion and remove it from YAML when you commit.',
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
