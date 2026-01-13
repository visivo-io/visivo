import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { validateName } from './namedModel';

/**
 * TableEditForm - Form component for editing/creating tables
 *
 * Tables combine insights with pagination configuration.
 *
 * Props:
 * - table: Table object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onNavigateToEmbedded: Callback(type, object) to navigate to embedded objects
 */
const TableEditForm = ({ table, isCreate, onClose, onSave, onNavigateToEmbedded }) => {
  const { saveTableConfig, deleteTableConfig, checkPublishStatus, insightConfigs, fetchInsightConfigs } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [insights, setInsights] = useState([]);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!table && !isCreate;
  const isNewObject = table?.status === ObjectStatus.NEW;

  // Get available insights from the insight store
  const availableInsights = insightConfigs?.map(i => i.name) || [];

  // Rows per page options
  const ROWS_PER_PAGE_OPTIONS = [3, 5, 15, 25, 50, 100, 500, 1000];

  // Fetch insights on mount if needed
  useEffect(() => {
    if (!insightConfigs || insightConfigs.length === 0) {
      fetchInsightConfigs();
    }
  }, [insightConfigs, fetchInsightConfigs]);

  // Detect embedded insights (objects vs refs)
  const rawInsights = table?.config?.insights || table?.insights || [];
  const embeddedInsights = rawInsights
    .map((insight, index) => ({ insight, index }))
    .filter(({ insight }) => typeof insight === 'object');

  // Initialize form when table changes
  useEffect(() => {
    if (table) {
      // Edit mode - populate from existing table
      setName(table.name || '');

      // Extract insight refs (strings only, not embedded objects)
      const tableInsights = table.config?.insights || table.insights || [];
      setInsights(
        tableInsights
          .filter(i => typeof i === 'string')
          .map(i => i.replace('ref(', '').replace(')', ''))
      );

      // Rows per page
      setRowsPerPage(table.config?.rows_per_page || table.rows_per_page || 25);
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setInsights([]);
      setRowsPerPage(25);
    }
    setErrors({});
    setSaveError(null);
  }, [table, isCreate]);

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
        rows_per_page: rowsPerPage,
      };

      // Combine ref insights with embedded insights (preserve embedded)
      const refInsights = insights.map(i => `ref(${i})`);
      const embeddedInsightObjects = embeddedInsights.map(({ insight }) => insight);

      if (refInsights.length > 0 || embeddedInsightObjects.length > 0) {
        config.insights = [...refInsights, ...embeddedInsightObjects];
      }

      const result = await saveTableConfig(name, config);

      if (result?.success) {
        onSave && onSave(config);
        onClose();
      } else {
        setSaveError(result?.error || 'Failed to save table');
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save table');
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteTableConfig(table.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete table');
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
                id="tableName"
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
                htmlFor="tableName"
                className={`
                  absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                  bg-white px-1 left-2
                  peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                  peer-placeholder-shown:top-1/2
                  peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                  ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
                `}
              >
                Table Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Rows per page field */}
            <div className="relative">
              <select
                id="tableRowsPerPage"
                value={rowsPerPage}
                onChange={e => setRowsPerPage(parseInt(e.target.value, 10))}
                className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {ROWS_PER_PAGE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <label
                htmlFor="tableRowsPerPage"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Rows Per Page
              </label>
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
                No insights available. Create insights first to add them to tables.
              </p>
            ) : insights.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights added. Add insights to display data in this table.
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

            {/* Embedded Insights Section */}
            {embeddedInsights.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Embedded Insights</h4>
                <div className="space-y-2">
                  {embeddedInsights.map(({ insight, index }) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        if (onNavigateToEmbedded) {
                          const syntheticInsight = {
                            name: insight.name || `(embedded insight ${index + 1})`,
                            status: 'published',
                            child_item_names: [],
                            config: insight,
                            _isEmbedded: true,
                            _parentName: table.name,
                            _parentType: 'table',
                            _embeddedIndex: index,
                          };
                          onNavigateToEmbedded('insight', syntheticInsight);
                        }
                      }}
                      className="w-full text-left px-3 py-2 bg-pink-50 border border-pink-200 rounded-md hover:bg-pink-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-pink-700">
                            {insight.name || `Insight ${index + 1}`}
                          </span>
                          <span className="text-xs text-pink-600 ml-2">(embedded)</span>
                        </div>
                        <ChevronRightIcon className="text-pink-500" fontSize="small" />
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Click to edit embedded insight configuration.
                </p>
              </div>
            )}
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
                ? 'Are you sure you want to delete this table? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this table? This will mark it for deletion and remove it from YAML when you publish.'}
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
                title="Delete table"
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

export default TableEditForm;
