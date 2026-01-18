import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormTextarea, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from './RefTextArea';
import { validateName } from './namedModel';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { getTypeByValue } from './objectTypeConfigs';
import { BackNavigationButton } from '../../styled/BackNavigationButton';

/**
 * MetricEditForm - Form component for editing/creating metrics
 *
 * Metrics can be either:
 * 1. Project-level (multi-model): Created via + button, can use refs to reference models/dimensions/metrics
 * 2. Embedded: Inline metric within a model (uses _embedded metadata), plain SQL only
 *
 * Props:
 * - metric: Metric object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save (type, name, config)
 * - onGoBack: Callback to navigate back to parent (for embedded metrics)
 */
const MetricEditForm = ({ metric, isCreate, onClose, onSave, onGoBack }) => {
  const { saveMetric, deleteMetric, checkPublishStatus } = useStore();

  // Detect embedded mode (inline metric within a model)
  const isEmbedded = isEmbeddedObject(metric);
  const parentName = metric?._embedded?.parentName;

  // Form state
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // For embedded metrics, we allow name editing since they're being created inline
  // For standalone metrics, name is read-only in edit mode
  const isEditMode = !!metric && !isCreate && !isEmbedded;
  const isNewObject = metric?.status === ObjectStatus.NEW;

  // Initialize form when metric changes
  useEffect(() => {
    if (metric) {
      // Edit mode - populate from existing metric
      // For embedded metrics, get name from config.name (it's the actual metric name)
      const metricName = metric.config?.name || metric.name || '';
      setName(metricName);
      setExpression(metric.config?.expression || '');
      setDescription(metric.config?.description || '');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setExpression('');
      setDescription('');
    }
    setErrors({});
    setSaveError(null);
  }, [metric, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!expression.trim()) {
      newErrors.expression = 'Expression is required';
    } else if (isEmbedded) {
      // Embedded (inline) metrics cannot contain ref() expressions
      const refPattern = /\$\{\s*ref\s*\(/;
      if (refPattern.test(expression)) {
        newErrors.expression =
          'Inline metrics cannot use ref() expressions. Use plain SQL referencing fields from the parent model.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    // Build the metric config
    const config = {
      name,
      expression,
      description: description || undefined,
    };

    try {
      if (isEmbedded) {
        // Embedded metric - use unified save callback
        // Parent will handle updating the stack via applyToParent
        const result = await onSave('metric', name, config);
        setSaving(false);
        if (!result?.success) {
          setSaveError(result?.error || 'Failed to save metric');
        }
        // Parent handles panel close on success
      } else {
        // Save as project-level metric (always multi-model)
        const result = await saveMetric(name, config);

        setSaving(false);
        if (result?.success) {
          onSave && onSave(config);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save metric');
        }
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save metric');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteMetric(metric.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete metric');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <FormLayout>
        {/* Embedded metric back navigation */}
        {isEmbedded && onGoBack && (
          <BackNavigationButton
            onClick={onGoBack}
            typeConfig={getTypeByValue('model')}
            label="Model"
            name={parentName}
          />
        )}

        <FormInput
          id="metricName"
          label="Metric Name"
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
          allowedTypes={isEmbedded ? [] : ['model', 'metric', 'dimension']}
          hideAddButton={isEmbedded}
          rows={4}
          helperText={
            isEmbedded
              ? 'SQL aggregate expression (e.g., SUM, COUNT, AVG) referencing columns from the parent model.'
              : 'SQL aggregate expression for this metric. Use the + button to insert references.'
          }
        />

        <FormTextarea
          id="metricDescription"
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
                  ? 'Are you sure you want to delete this metric? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this metric? This will mark it for deletion and remove it from YAML when you publish.',
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

export default MetricEditForm;
