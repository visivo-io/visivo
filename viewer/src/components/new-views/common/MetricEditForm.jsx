import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefTextArea from './RefTextArea';

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

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      newErrors.name =
        'Name must start with a letter and contain only letters, numbers, underscores, and hyphens';
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
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-5">
        {/* Parent Model selector */}
        <div className="relative">
          <select
            id="parentModel"
            value={parentModel}
            onChange={e => {
              setParentModel(e.target.value);
              // Clear expression errors when switching modes
              if (errors.expression) {
                setErrors(prev => ({ ...prev, expression: null }));
              }
            }}
            className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 border-gray-300"
          >
            <option value="">Multi-model (project-level)</option>
            {models.map(model => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
          <label
            htmlFor="parentModel"
            className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
          >
            Parent Model
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {isModelScoped
              ? 'This metric will be scoped to the selected model and use plain SQL.'
              : 'This metric can reference multiple models using ${ref(model_name)}.'}
          </p>
        </div>

        {/* Name field */}
        <div className="relative">
          <input
            type="text"
            id="metricName"
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
            htmlFor="metricName"
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            Metric Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        {/* Expression - different UI based on model scope */}
        {isModelScoped ? (
          /* Model-scoped: plain SQL textarea */
          <div className="relative">
            <textarea
              id="metricExpression"
              value={expression}
              onChange={e => setExpression(e.target.value)}
              placeholder=" "
              rows={4}
              className={`
                block w-full px-3 py-2.5 text-sm text-gray-900
                bg-white rounded-md border appearance-none
                focus:outline-none focus:ring-2 focus:border-primary-500
                peer placeholder-transparent resize-y font-mono
                ${errors.expression ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
              `}
            />
            <label
              htmlFor="metricExpression"
              className={`
                absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                bg-white px-1 left-2
                peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                peer-placeholder-shown:top-3
                peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                ${errors.expression ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
              `}
            >
              Expression<span className="text-red-500 ml-0.5">*</span>
            </label>
            {errors.expression && <p className="mt-1 text-xs text-red-500">{errors.expression}</p>}
            <p className="mt-1 text-xs text-gray-500">
              SQL aggregate expression (e.g., SUM, COUNT, AVG) referencing columns from the parent model.
            </p>
          </div>
        ) : (
          /* Project-level: RefTextArea with ref support */
          <RefTextArea
            value={expression}
            onChange={setExpression}
            label="Expression"
            required
            error={errors.expression}
            allowedTypes={['model', 'metric', 'dimension']}
            rows={4}
            helperText="SQL aggregate expression for this metric. Use the + button to insert references."
          />
        )}

        {/* Description (optional) */}
        <div className="relative">
          <textarea
            id="metricDescription"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder=" "
            rows={2}
            className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 peer placeholder-transparent resize-y"
          />
          <label
            htmlFor="metricDescription"
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
                ? 'Are you sure you want to delete this metric? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this metric? This will mark it for deletion and remove it from YAML when you publish.'}
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
                title="Delete metric"
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

export default MetricEditForm;
