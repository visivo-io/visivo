import React, { useState, useEffect } from 'react';
import useStore from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { formatRef } from '../../../utils/refString';
import {
  applyLeafRef,
  appendEmptyItem,
  createRow,
} from '../workspace/itemMutations';
import RowEditForm from './RowEditForm';

/**
 * DashboardEditForm - Form for creating/editing Dashboard
 *
 * Supports nested rows with items. Each row has height and items list.
 * Each item has width and a single object reference selected from available objects.
 */
const DashboardEditForm = ({ dashboard, isCreate, onSave, onClose }) => {
  const deleteDashboard = useStore(state => state.deleteDashboard);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);
  const openWorkspaceTab = useStore(state => state.openWorkspaceTab);

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
      // Normalize item field values: objects become ref(name), strings stay as-is
      const normalizeRef = val => {
        if (!val) return '';
        if (typeof val === 'object') return val.name ? formatRef(val.name) : '';
        return val;
      };
      setRows(
        (dashboard.config?.rows || []).map(row => ({
          height: row.height || 'medium',
          items: (row.items || []).map(item => ({
            width: item.width || 1,
            chart: normalizeRef(item.chart),
            table: normalizeRef(item.table),
            markdown: normalizeRef(item.markdown),
            input: normalizeRef(item.input),
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
          else if (item.input) itemConfig.input = item.input;
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
        await checkCommitStatus();
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
    // VIS-993: rows/items are scaffolded through itemMutations, born valid —
    // no empty-string leaf keys, no non-model `selector`.
    setRows([...rows, createRow()]);
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
    updated[rowIndex] = appendEmptyItem(updated[rowIndex]);
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

  const updateItemWidth = (rowIndex, itemIndex, width) => {
    const updated = [...rows];
    const item = { ...updated[rowIndex].items[itemIndex], width };
    updated[rowIndex] = {
      ...updated[rowIndex],
      items: updated[rowIndex].items.map((it, i) => (i === itemIndex ? item : it)),
    };
    setRows(updated);
  };

  /**
   * Set or clear the object reference held by an item. `ref` is `{ type, name }`
   * to set, or `null` to clear. itemMutations enforces the mutual exclusion so
   * only one type is ever populated (matching the dashboard item model) and the
   * result is born backend-valid (VIS-993).
   */
  const handleItemRefChange = (rowIndex, itemIndex, ref) => {
    const updated = [...rows];
    updated[rowIndex] = {
      ...updated[rowIndex],
      items: updated[rowIndex].items.map((it, i) => (i === itemIndex ? applyLeafRef(it, ref) : it)),
    };
    setRows(updated);
  };

  /**
   * Pill click → focus the referenced object in the workspace.
   */
  const handleSelectRef = ref => {
    if (ref && ref.type && ref.name && openWorkspaceTab) {
      openWorkspaceTab({ type: ref.type, name: ref.name });
    }
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
                <RowEditForm
                  key={rowIndex}
                  row={row}
                  rowId={rowIndex}
                  rowIndex={rowIndex}
                  onRemoveRow={() => removeRow(rowIndex)}
                  onHeightChange={height => updateRowHeight(rowIndex, height)}
                  onAddItem={() => addItem(rowIndex)}
                  onRemoveItem={itemIndex => removeItem(rowIndex, itemIndex)}
                  onItemWidthChange={(itemIndex, width) => updateItemWidth(rowIndex, itemIndex, width)}
                  onItemRefChange={(itemIndex, ref) => handleItemRefChange(rowIndex, itemIndex, ref)}
                  onSelectRef={handleSelectRef}
                />
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
                : 'Are you sure you want to delete this dashboard? This will mark it for deletion and remove it from YAML when you commit.'}
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
            <Button
              type="submit"
              data-onb-target="dashboard-save"
              disabled={!isValid || saving || deleting}
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
      </form>
    </div>
  );
};

export default DashboardEditForm;
