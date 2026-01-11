import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { validateName } from './namedModel';
import { SchemaEditor } from './SchemaEditor';
import { getSchema } from '../../../schemas';

/**
 * ChartEditForm - Form component for editing/creating charts
 *
 * Charts combine insights with layout configuration.
 *
 * Props:
 * - chart: Chart object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const ChartEditForm = ({ chart, isCreate, onClose, onSave }) => {
  const { saveChartConfig, deleteChartConfig, checkPublishStatus, insightConfigs, fetchInsightConfigs } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [insights, setInsights] = useState([]);
  const [layoutValues, setLayoutValues] = useState({});

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!chart && !isCreate;
  const isNewObject = chart?.status === ObjectStatus.NEW;

  // Get available insights from the insight store
  const availableInsights = insightConfigs?.map(i => i.name) || [];

  // Get the layout schema
  const layoutSchema = getSchema('layout');

  // Fetch insights on mount if needed
  useEffect(() => {
    if (!insightConfigs || insightConfigs.length === 0) {
      fetchInsightConfigs();
    }
  }, [insightConfigs, fetchInsightConfigs]);

  // Initialize form when chart changes
  useEffect(() => {
    if (chart) {
      // Edit mode - populate from existing chart
      setName(chart.name || '');

      // Extract insight refs
      const chartInsights = chart.config?.insights || chart.insights || [];
      setInsights(chartInsights.map(i => (typeof i === 'string' ? i.replace('ref(', '').replace(')', '') : i)));

      // Layout as object
      const layout = chart.config?.layout || chart.layout || {};
      setLayoutValues(layout);
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setInsights([]);
      setLayoutValues({});
    }
    setErrors({});
    setSaveError(null);
  }, [chart, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (insights.length === 0) {
      newErrors.data = 'At least one insight is required';
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
      };

      // Add insights as refs
      if (insights.length > 0) {
        config.insights = insights.map(i => `ref(${i})`);
      }

      // Add layout if there are values
      if (Object.keys(layoutValues).length > 0) {
        config.layout = layoutValues;
      }

      const result = await saveChartConfig(name, config);

      if (result?.success) {
        onSave && onSave(config);
        onClose();
      } else {
        setSaveError(result?.error || 'Failed to save chart');
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save chart');
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteChartConfig(chart.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete chart');
      setShowDeleteConfirm(false);
    }
  };

  // Insight management
  const addInsight = () => {
    const availableToAdd = availableInsights.filter(i => !insights.includes(i));
    if (availableToAdd.length > 0) {
      setInsights([...insights, availableToAdd[0]]);
    }
  };

  const removeInsight = index => {
    setInsights(insights.filter((_, i) => i !== index));
  };

  const updateInsight = (index, value) => {
    const updated = [...insights];
    updated[index] = value;
    setInsights(updated);
  };

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
                id="chartName"
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
                htmlFor="chartName"
                className={`
                  absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                  bg-white px-1 left-2
                  peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                  peer-placeholder-shown:top-1/2
                  peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                  ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
                `}
              >
                Chart Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
          </div>

          {/* Insights Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-medium text-gray-700">Insights</h3>
              <button
                type="button"
                onClick={addInsight}
                disabled={availableInsights.filter(i => !insights.includes(i)).length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AddIcon fontSize="small" />
                Add Insight
              </button>
            </div>

            {availableInsights.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights available. Create insights first to add them to charts.
              </p>
            ) : insights.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights added. Add insights to visualize data in this chart.
              </p>
            ) : (
              insights.map((insight, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={insight}
                    onChange={e => updateInsight(index, e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {availableInsights.map(i => (
                      <option key={i} value={i} disabled={insights.includes(i) && i !== insight}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeInsight(index)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Remove insight"
                  >
                    <RemoveIcon fontSize="small" />
                  </button>
                </div>
              ))
            )}

            {errors.data && <p className="text-xs text-red-500">{errors.data}</p>}
          </div>

          {/* Layout Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Layout Configuration (Optional)
            </h3>

            {layoutSchema && (
              <SchemaEditor
                schema={layoutSchema}
                value={layoutValues}
                onChange={setLayoutValues}
              />
            )}
            <p className="text-xs text-gray-500">
              Plotly layout configuration. See{' '}
              <a
                href="https://plotly.com/javascript/reference/layout/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                Plotly docs
              </a>{' '}
              for options.
            </p>
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
                ? 'Are you sure you want to delete this chart? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this chart? This will mark it for deletion and remove it from YAML when you publish.'}
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
                title="Delete chart"
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

export default ChartEditForm;
