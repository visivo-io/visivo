import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { parseRefValue, formatRef } from '../../../utils/refString';

/**
 * TableEditForm - Form component for editing/creating tables
 *
 * Tables use a `data` field to reference a single insight or model as their data source.
 *
 * Props:
 * - table: Table object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onNavigateToEmbedded: Callback(type, object) to navigate to embedded objects
 */
const TableEditForm = ({ table, isCreate, onClose, onSave, onNavigateToEmbedded }) => {
  const { deleteTable, checkPublishStatus, insights: storeInsights, fetchInsights } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [dataRef, setDataRef] = useState('');
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
  const availableInsights = storeInsights?.map(i => i.name) || [];

  // Rows per page options
  const ROWS_PER_PAGE_OPTIONS = [3, 5, 15, 25, 50, 100, 500, 1000];

  // Fetch insights on mount if needed
  useEffect(() => {
    if (!storeInsights || storeInsights.length === 0) {
      fetchInsights();
    }
  }, [storeInsights, fetchInsights]);

  // Detect embedded data (object vs ref)
  const rawData = table?.config?.data || table?.data;
  const isEmbeddedData = rawData && typeof rawData === 'object';

  // Initialize form when table changes
  useEffect(() => {
    if (table) {
      setName(table.name || '');

      const tableData = table.config?.data || table.data;
      if (typeof tableData === 'string') {
        setDataRef(parseRefValue(tableData) || '');
      } else {
        setDataRef('');
      }

      setRowsPerPage(table.config?.rows_per_page || table.rows_per_page || 25);
    } else if (isCreate) {
      setName('');
      setDataRef('');
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

    if (!dataRef && !isEmbeddedData) {
      newErrors.data = 'A data source (insight or model) is required';
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
      rows_per_page: rowsPerPage,
    };

    if (isEmbeddedData) {
      config.data = rawData;
    } else if (dataRef) {
      config.data = formatRef(dataRef);
    }

    const result = await onSave('table', name, config);

    setSaving(false);

    if (!result?.success) {
      setSaveError(result?.error || 'Failed to save table');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteTable(table.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete table');
      setShowDeleteConfirm(false);
    }
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

          {/* Data Source Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-medium text-gray-700">Data Source</h3>
            </div>

            {isEmbeddedData ? (
              (() => {
                const insightTypeConfig = getTypeByValue('insight');
                const InsightIcon = insightTypeConfig?.icon;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToEmbedded) {
                        const syntheticObject = {
                          name: rawData.name || '(embedded data)',
                          config: rawData,
                          _embedded: { parentType: 'table', parentName: table.name, path: 'data' },
                        };
                        onNavigateToEmbedded('insight', syntheticObject, {
                          applyToParent: (parentConfig, newConfig) => ({
                            ...parentConfig,
                            data: newConfig,
                          }),
                        });
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${insightTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${insightTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
                  >
                    {InsightIcon && <InsightIcon fontSize="small" className={insightTypeConfig?.colors?.text || 'text-gray-600'} />}
                    <span className={`text-sm font-medium ${insightTypeConfig?.colors?.text || 'text-gray-700'}`}>
                      {rawData.name || 'Embedded data source'}
                    </span>
                    <ChevronRightIcon fontSize="small" className={`ml-auto ${insightTypeConfig?.colors?.text || 'text-gray-600'}`} />
                  </button>
                );
              })()
            ) : (
              <div className="relative">
                <select
                  id="tableData"
                  value={dataRef}
                  onChange={e => setDataRef(e.target.value)}
                  className={`block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.data ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select an insight or model...</option>
                  {availableInsights.map(i => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                <label
                  htmlFor="tableData"
                  className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
                >
                  Data<span className="text-red-500 ml-0.5">*</span>
                </label>
                {errors.data && <p className="mt-1 text-xs text-red-500">{errors.data}</p>}
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
