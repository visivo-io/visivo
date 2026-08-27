import React, { useState, useEffect, useRef, useCallback } from 'react';
import useFormBaseline from '../../../hooks/useFormBaseline';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { parseRefValue, formatRef } from '../../../utils/refString';
import RefTextArea from './RefTextArea';
import Select from '../../common/Select';
import { refKindsFor } from './fieldTypes';
import { REF_INSERT_HINT } from './RefTextArea';

/**
 * TableEditForm - Form component for editing/creating tables
 *
 * Tables can use:
 * - `data` field to reference a single insight or model as their data source
 * - `columns`, `rows`, `values` fields for pivot table configuration
 *
 * Props:
 * - table: Table object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onNavigateToEmbedded: Callback(type, object) to navigate to embedded objects
 */
const TableEditForm = ({ table, isCreate, onClose, onSave, onNavigateToEmbedded, onDirtyChange }) => {
  const {
    deleteTable,
    checkCommitStatus,
    insights: storeInsights,
    fetchInsights,
    models: storeModels,
    fetchModels,
  } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [dataRef, setDataRef] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState([]);

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!table && !isCreate;
  const isNewObject = table?.status === ObjectStatus.NEW;

  // Combine insights and models for the data source dropdown
  const availableInsights = storeInsights?.map(i => ({ name: i.name, type: 'insight' })) || [];
  const availableModels = storeModels?.map(m => ({ name: m.name, type: 'model' })) || [];
  const hasPivotFields = columns.length > 0 || rows.length > 0 || values.length > 0;

  // Rows per page options
  const ROWS_PER_PAGE_OPTIONS = [3, 5, 15, 25, 50, 100, 500, 1000];

  // Fetch insights and models on mount if needed. Guarded by a ref: the store
  // writes a FRESH array on every fetch (even an empty one), so gating on
  // emptiness alone re-fires the effect forever in a project with zero objects.
  const fetchedRef = useRef({ insights: false, models: false });
  useEffect(() => {
    if (!fetchedRef.current.insights && (!storeInsights || storeInsights.length === 0)) {
      fetchedRef.current.insights = true;
      fetchInsights();
    }
    if (!fetchedRef.current.models && (!storeModels || storeModels.length === 0)) {
      fetchedRef.current.models = true;
      fetchModels();
    }
  }, [storeInsights, fetchInsights, storeModels, fetchModels]);

  // Detect embedded data (object vs ref)
  const rawData = table?.config?.data || table?.data;
  const isEmbeddedData = rawData && typeof rawData === 'object';

  // Initialize form when table changes
  // VIS-1133: the saved table, as form state — one shape for both seeding and
  // the dirty check, so they cannot disagree.
  const applyValues = useCallback(values => {
    setName(values.name);
    setDataRef(values.dataRef);
    setRowsPerPage(values.rowsPerPage);
    setColumns(values.columns);
    setRows(values.rows);
    setValues(values.values);
  }, []);
  // Per-object drafts: unsaved edits survive navigating away and reloads.
  const draftKey = isEditMode && table?.name ? `table:${table.name}` : undefined;
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues, draftKey);

  useEffect(() => {
    if (table) {
      const config = table.config || table;
      const tableData = config.data;
      seed({
        name: table.name || '',
        dataRef: typeof tableData === 'string' ? parseRefValue(tableData) || '' : '',
        rowsPerPage: config.rows_per_page || 25,
        columns: config.columns || [],
        rows: config.rows || [],
        values: config.values || [],
      });
    } else if (isCreate) {
      seed({ name: '', dataRef: '', rowsPerPage: 25, columns: [], rows: [], values: [] });
    }
    setErrors({});
    setSaveError(null);
    // Re-seeding on `seed` would wipe the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, isCreate]);

  const dirty = isDirtyAgainst({ name, dataRef, rowsPerPage, columns, rows, values });

  // Report upward so the tab strip's unsaved dot and its guarded close reflect
  // real edits (VIS-1133) — the rail clears it on unmount.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Blank pivot entries (the '' scaffold RefListField's Add button creates, or
  // whitespace-only edits) must never save — `columns: ['']` is not a valid
  // pivot config. Validation rejects them with a visible per-list error.
  const hasBlankEntry = list => list.some(entry => typeof entry === 'string' && entry.trim() === '');

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!dataRef && !isEmbeddedData && !hasPivotFields) {
      newErrors.data = 'A data source or pivot configuration (columns/rows/values) is required';
    }

    if (dataRef && hasPivotFields) {
      newErrors.data = 'Cannot use both data source and columns/rows/values';
    }

    if ((rows.length > 0 || values.length > 0) && columns.length === 0) {
      newErrors.columns = 'Columns are required when using rows and values';
    }

    if ((rows.length > 0) !== (values.length > 0)) {
      newErrors.rows = 'Rows and values must be specified together';
    }

    if (hasBlankEntry(columns)) {
      newErrors.columns = 'Column entries cannot be empty';
    }
    if (hasBlankEntry(rows)) {
      newErrors.rows = 'Row entries cannot be empty';
    }
    if (hasBlankEntry(values)) {
      newErrors.values = 'Value entries cannot be empty';
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

    if (columns.length > 0) config.columns = columns;
    if (rows.length > 0) config.rows = rows;
    if (values.length > 0) config.values = values;

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
      await checkCommitStatus();
      // Optional: the right rail supplies it to close the tab, a modal host
      // to dismiss itself. Calling it unguarded threw when neither did.
      onClose?.();
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
              <Select
                id="tableRowsPerPage"
                aria-label="Rows Per Page"
                value={rowsPerPage}
                options={ROWS_PER_PAGE_OPTIONS.map(option => ({
                  value: option,
                  label: String(option),
                }))}
                onChange={value => setRowsPerPage(parseInt(value, 10))}
              />
              <label
                htmlFor="tableRowsPerPage"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Rows Per Page
              </label>
            </div>
          </div>

          {/* Data Source Section — hidden when pivot fields are configured,
              EXCEPT when a data source is ALSO set (an invalid combination,
              e.g. from YAML): both sections stay visible so the user can see
              the validation error and remove one of the two. */}
          {(!hasPivotFields || !!dataRef || isEmbeddedData) && (
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
                  <Select
                    id="tableData"
                    aria-label="Data"
                    placeholder="Select a data source..."
                    value={dataRef}
                    options={[
                      ...(availableInsights.length > 0
                        ? [
                            {
                              label: 'Insights',
                              options: availableInsights.map(i => ({
                                value: i.name,
                                label: i.name,
                                type: 'insight',
                              })),
                            },
                          ]
                        : []),
                      ...(availableModels.length > 0
                        ? [
                            {
                              label: 'Models',
                              options: availableModels.map(m => ({
                                value: m.name,
                                label: m.name,
                                type: 'model',
                              })),
                            },
                          ]
                        : []),
                    ]}
                    onChange={value => setDataRef(value || '')}
                  />
                  <label
                    htmlFor="tableData"
                    className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
                  >
                    Data
                  </label>
                  {errors.data && <p className="mt-1 text-xs text-red-500">{errors.data}</p>}
                </div>
              )}
            </div>
          )}

          {/* Pivot Configuration Section — hidden when a data source is set,
              EXCEPT when pivot fields ALSO exist (see Data Source note). */}
          {((!dataRef && !isEmbeddedData) || hasPivotFields) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <h3 className="text-sm font-medium text-gray-700">Pivot Configuration</h3>
              </div>

              <RefListField
                label="Columns"
                items={columns}
                onChange={setColumns}
                helperText={`Field references for pivot column headers. ${REF_INSERT_HINT}`}
                error={errors.columns}
              />

              <RefListField
                label="Rows"
                items={rows}
                onChange={setRows}
                helperText={`Field references for pivot row grouping. ${REF_INSERT_HINT}`}
                error={errors.rows}
              />

              <RefListField
                label="Values"
                items={values}
                onChange={setValues}
                helperText={`Aggregation expressions, e.g. sum(...). ${REF_INSERT_HINT}`}
                error={errors.values}
              />
            </div>
          )}

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
                : 'Are you sure you want to delete this table? This will mark it for deletion and remove it from YAML when you commit.'}
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
            {/* VIS-1133: no modal to close in the rail, so this reverts to the
                last saved values. Create mode (modal hosts) keeps Cancel. */}
            <ButtonOutline
              type="button"
              onClick={isEditMode ? discard : onClose}
              disabled={isEditMode && (!dirty || saving || deleting)}
              data-testid="table-form-discard"
              className="text-sm"
            >
              {isEditMode ? 'Discard' : 'Cancel'}
            </ButtonOutline>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || (isEditMode && !dirty)}
              className="text-sm"
            >
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

/**
 * Reusable component for editing a list of ref expressions using RefTextArea.
 */
const RefListField = ({ label, items, onChange, helperText, error }) => {
  const handleAdd = () => onChange([...items, '']);
  const handleRemove = index => onChange(items.filter((_, i) => i !== index));
  const handleChange = (index, value) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-0.5 text-xs text-primary-600 hover:text-primary-700"
        >
          <AddIcon fontSize="inherit" />
          Add
        </button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <div className="flex-1">
            <RefTextArea
              value={item}
              onChange={value => handleChange(index, value)}
              allowedTypes={refKindsFor('table', 'columns')}
              rows={1}
            />
          </div>
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="mt-1 p-0.5 text-gray-400 hover:text-red-500 transition-colors"
            title={`Remove ${label.toLowerCase()} entry`}
          >
            <RemoveCircleOutlineIcon fontSize="small" />
          </button>
        </div>
      ))}
      {items.length === 0 && helperText && (
        <p className="text-xs text-gray-400">{helperText}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default TableEditForm;
