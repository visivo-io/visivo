import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormTextarea, FormSelect, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from './RefTextArea';
import { validateName } from './namedModel';

/**
 * MetricEditForm - Form component for editing/creating metrics
 *
 * Metrics can be either:
 * 1. Model-scoped: Attached to a specific model, plain SQL expression (no refs)
 * 2. Project-level (multi-model): Standalone, can use refs to reference models/dimensions/metrics
 *
 * Props:
 * - metric: Metric object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const MetricEditForm = ({ metric, isCreate, onClose, onSave }) => {
  const { saveMetric, deleteMetric, checkPublishStatus, models, saveModel, fetchModels } = useStore();

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

  const isEditMode = !!metric && !isCreate;
  const isNewObject = metric?.status === ObjectStatus.NEW;
  const isModelScoped = !!parentModel;

  // Initialize form when metric changes
  useEffect(() => {
    if (metric) {
      // Edit mode - populate from existing metric
      setName(metric.name || '');
      setExpression(metric.config?.expression || '');
      setDescription(metric.config?.description || '');
      setParentModel(metric.parentModel || '');
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setExpression('');
      setDescription('');
      setParentModel('');
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
    } else if (isModelScoped) {
      // Model-scoped metrics cannot contain ref() expressions
      const refPattern = /\$\{\s*ref\s*\(/;
      if (refPattern.test(expression)) {
        newErrors.expression = 'Model-scoped metrics cannot use ref() expressions. Use plain SQL referencing fields from the parent model.';
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
        // Save as model-scoped metric - update the parent model
        const model = models.find(m => m.name === parentModel);
        if (!model) {
          setSaveError(`Model "${parentModel}" not found`);
          setSaving(false);
          return;
        }

        // Build updated metrics list
        const existingMetrics = model.config?.metrics || [];
        const newMetric = {
          name,
          expression,
          description: description || undefined,
        };

        // Replace or add the metric
        const metricIndex = existingMetrics.findIndex(m => m.name === name);
        let updatedMetrics;
        if (metricIndex >= 0) {
          updatedMetrics = [...existingMetrics];
          updatedMetrics[metricIndex] = newMetric;
        } else {
          updatedMetrics = [...existingMetrics, newMetric];
        }

        // Update the model with new metrics
        const updatedConfig = {
          ...model.config,
          name: model.name,
          sql: model.sql || model.config?.sql,
          metrics: updatedMetrics,
        };

        const result = await saveModel(parentModel, updatedConfig);
        await fetchModels();

        if (result?.success) {
          onSave && onSave(newMetric);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save metric to model');
        }
      } else {
        // Save as project-level metric
        const config = {
          name,
          expression,
          description: description || undefined,
        };

        const result = await saveMetric(name, config);

        if (result?.success) {
          onSave && onSave(config);
          onClose();
        } else {
          setSaveError(result?.error || 'Failed to save metric');
        }
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save metric');
    }

    setSaving(false);
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
        <FormInput
          id="metricName"
          label="Metric Name"
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
              ? 'This metric will be scoped to the selected model and use plain SQL.'
              /* eslint-disable-next-line no-template-curly-in-string */
              : 'This metric can reference multiple models using ${ref(model_name)}.'
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
          allowedTypes={isModelScoped ? [] : ['model', 'metric', 'dimension']}
          hideAddButton={isModelScoped}
          rows={4}
          helperText={
            isModelScoped
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
