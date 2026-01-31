import React, { useState, useEffect } from 'react';
import useStore from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

const HEIGHT_OPTIONS = ['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge'];

/**
 * DashboardEditForm - Form for creating/editing Dashboard
 *
 * Supports nested rows with items. Each row has height and items list.
 * Each item has width and one of: chart, table, markdown, selector, input (as ref).
 */
const DashboardEditForm = ({ dashboard, isCreate, onSave, onClose }) => {
  const deleteDashboard = useStore(state => state.deleteDashboard);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);

  const [name, setName] = useState('');
  const [rows, setRows] = useState([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name || '');
      setDescription(dashboard.config?.description || '');
      setRows(
        (dashboard.config?.rows || []).map(row => ({
          height: row.height || 'medium',
          items: (row.items || []).map(item => ({
            width: item.width || 1,
            chart: item.chart || '',
            table: item.table || '',
            markdown: item.markdown || '',
            selector: item.selector || '',
          })),
        }))
      );
    } else {
      setName('');
      setDescription('');
      setRows([]);
    }
  }, [dashboard]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const config = {
      name: name.trim(),
      type: 'internal',
    };

    if (description.trim()) config.description = description.trim();

    config.rows = rows.map(row => {
      const rowConfig = { height: row.height };
      rowConfig.items = row.items
        .map(item => {
          const itemConfig = {};
          if (item.width && item.width !== 1) itemConfig.width = Number(item.width);
          if (item.chart) itemConfig.chart = item.chart;
          else if (item.table) itemConfig.table = item.table;
          else if (item.markdown) itemConfig.markdown = item.markdown;
          else if (item.selector) itemConfig.selector = item.selector;
          else return null;
          return itemConfig;
        })
        .filter(Boolean);
      return rowConfig;
    });

    const result = await onSave('dashboard', config.name, config);
    setSaving(false);

    if (!result?.success) {
      setError(result?.error || 'Failed to save dashboard');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteDashboard(dashboard.name);
      if (result.success) {
        await checkPublishStatus();
        onClose();
      } else {
        setError(result.error || 'Failed to delete dashboard');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete dashboard');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const addRow = () => {
    setRows([...rows, { height: 'medium', items: [{ width: 1, chart: '', table: '', markdown: '', selector: '' }] }]);
  };

  const removeRow = index => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRowHeight = (index, height) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], height };
    setRows(updated);
  };

  const addItem = rowIndex => {
    const updated = [...rows];
    updated[rowIndex] = {
      ...updated[rowIndex],
      items: [...updated[rowIndex].items, { width: 1, chart: '', table: '', markdown: '', selector: '' }],
    };
    setRows(updated);
  };

  const removeItem = (rowIndex, itemIndex) => {
    const updated = [...rows];
    updated[rowIndex] = {
      ...updated[rowIndex],
      items: updated[rowIndex].items.filter((_, i) => i !== itemIndex),
    };
    setRows(updated);
  };

  const updateItem = (rowIndex, itemIndex, field, value) => {
    const updated = [...rows];
    const item = { ...updated[rowIndex].items[itemIndex] };
    // Clear other ref fields when setting a new one
    if (['chart', 'table', 'markdown', 'selector'].includes(field)) {
      item.chart = '';
      item.table = '';
      item.markdown = '';
      item.selector = '';
    }
    item[field] = value;
    updated[rowIndex] = {
      ...updated[rowIndex],
      items: updated[rowIndex].items.map((it, i) => (i === itemIndex ? item : it)),
    };
    setRows(updated);
  };

  const getItemRefType = item => {
    if (item.chart) return 'chart';
    if (item.table) return 'table';
    if (item.markdown) return 'markdown';
    if (item.selector) return 'selector';
    return 'chart';
  };

  const getItemRefValue = item => {
    return item.chart || item.table || item.markdown || item.selector || '';
  };

  const isValid = name.trim();
  const isNewObject = dashboard?.status === 'new';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormAlert variant="error">{error}</FormAlert>}

        <FormInput
          id="dashboard-name"
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!isCreate}
          helperText={!isCreate ? 'Dashboard names cannot be changed after creation.' : undefined}
        />

        <FormInput
          id="dashboard-description"
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
        />

        {/* Rows section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Rows</label>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add Row
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No rows defined. Add a row to start building your dashboard.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Row {rowIndex + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      className="p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Height:</label>
                    <select
                      value={row.height}
                      onChange={e => updateRowHeight(rowIndex, e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {HEIGHT_OPTIONS.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Items */}
                  <div className="space-y-2 pl-2 border-l-2 border-gray-300">
                    {row.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="p-2 bg-white border border-gray-200 rounded space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Item {itemIndex + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(rowIndex, itemIndex)}
                            className="p-0.5 text-red-400 hover:text-red-600 rounded"
                          >
                            <RemoveIcon style={{ fontSize: 14 }} />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-shrink-0">
                            <label className="text-xs text-gray-500">Width</label>
                            <input
                              type="number"
                              min="1"
                              value={item.width}
                              onChange={e => updateItem(rowIndex, itemIndex, 'width', e.target.value)}
                              className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">Type</label>
                            <select
                              value={getItemRefType(item)}
                              onChange={e => updateItem(rowIndex, itemIndex, e.target.value, getItemRefValue(item) || 'ref()')}
                              className="w-full text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="chart">Chart</option>
                              <option value="table">Table</option>
                              <option value="markdown">Markdown</option>
                              <option value="selector">Selector</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Reference</label>
                          <input
                            type="text"
                            value={getItemRefValue(item)}
                            onChange={e => updateItem(rowIndex, itemIndex, getItemRefType(item), e.target.value)}
                            placeholder="ref(object-name)"
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(rowIndex)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    >
                      <AddIcon style={{ fontSize: 14 }} />
                      Add Item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && !isCreate && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure you want to delete this dashboard? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this dashboard? This will mark it for deletion and remove it from YAML when you publish.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
          <div>
            {!isCreate && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete dashboard"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <ButtonOutline type="button" onClick={onClose} disabled={saving || deleting} className="text-sm">
              Cancel
            </ButtonOutline>
            <Button type="submit" disabled={!isValid || saving || deleting} className="text-sm">
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
      </form>
    </div>
  );
};

export default DashboardEditForm;
