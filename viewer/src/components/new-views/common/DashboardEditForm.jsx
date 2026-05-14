import React, { useState, useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { getTypeByValue } from './objectTypeConfigs';
import { parseRefValue, formatRef } from '../../../utils/refString';

const HEIGHT_OPTIONS = ['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge'];

/**
 * DashboardEditForm - Form for creating/editing Dashboard
 *
 * Supports nested rows with items. Each row has height and items list.
 * Each item has width and a single object reference selected from available objects.
 */
const DashboardEditForm = ({ dashboard, isCreate, onSave, onClose }) => {
  const deleteDashboard = useStore(state => state.deleteDashboard);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);
  const charts = useStore(state => state.charts);
  const tables = useStore(state => state.tables);
  const markdowns = useStore(state => state.markdowns);
  const inputs = useStore(state => state.inputs);

  const [name, setName] = useState('');
  const [rows, setRows] = useState([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Rename confirmation state — when the Name input differs from the original
  // dashboard name on a non-create form, we capture the rename and prompt the
  // user to confirm before applying.
  const [renameConfirm, setRenameConfirm] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const originalName = dashboard?.name || '';

  // Build available objects list grouped by type
  const availableObjects = useMemo(() => {
    const groups = [];
    if (charts?.length) {
      groups.push({ label: 'Charts', type: 'chart', items: charts.map(c => c.name) });
    }
    if (tables?.length) {
      groups.push({ label: 'Tables', type: 'table', items: tables.map(t => t.name) });
    }
    if (markdowns?.length) {
      groups.push({ label: 'Markdowns', type: 'markdown', items: markdowns.map(m => m.name) });
    }
    if (inputs?.length) {
      groups.push({ label: 'Inputs', type: 'input', items: inputs.map(i => i.name) });
    }
    return groups;
  }, [charts, tables, markdowns, inputs]);

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
            selector: normalizeRef(item.selector),
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

    const trimmedName = name.trim();

    // If this is an edit (not create) and the name has changed, run the rename
    // preview first so we can show a confirmation dialog with the count of
    // cross-object references that would be rewritten. The actual rename
    // happens via the dedicated /rename/ endpoint, after the user confirms.
    if (!isCreate && originalName && trimmedName !== originalName) {
      try {
        const previewRes = await fetch(
          `/api/dashboards/${encodeURIComponent(originalName)}/preview-rename/?new_name=${encodeURIComponent(trimmedName)}`,
        );
        const previewData = await previewRes.json();
        if (!previewRes.ok || previewData?.valid === false) {
          setError(previewData?.error || 'Cannot rename dashboard.');
          return;
        }
        setRenameConfirm({
          oldName: originalName,
          newName: trimmedName,
          rewrittenRefCount: previewData?.rewritten_ref_count ?? 0,
        });
        return;
      } catch (err) {
        setError(err?.message || 'Failed to preview rename.');
        return;
      }
    }

    setSaving(true);

    const config = {
      name: trimmedName,
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

  const handleRenameConfirm = async () => {
    if (!renameConfirm) return;
    setRenaming(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboards/${encodeURIComponent(renameConfirm.oldName)}/rename/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: renameConfirm.newName }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Rename failed.');
        return;
      }
      // Refresh publish status so the top-bar publish badge picks up the
      // pending rename, then close the form. The new dashboard's edit panel
      // will be re-opened by the parent if needed.
      await checkPublishStatus();
      setRenameConfirm(null);
      onClose();
    } catch (err) {
      setError(err?.message || 'Rename failed.');
    } finally {
      setRenaming(false);
    }
  };

  const handleRenameCancel = () => {
    setRenameConfirm(null);
    // Restore the input to the original name so the user knows the rename
    // was abandoned and can keep editing other fields.
    setName(originalName);
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
    setRows([...rows, { height: 'medium', items: [{ width: 1, chart: '', table: '', markdown: '', selector: '', input: '' }] }]);
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
      items: [...updated[rowIndex].items, { width: 1, chart: '', table: '', markdown: '', selector: '', input: '' }],
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
   * Get the combined "type:name" value for the current item selection
   */
  const getSelectedValue = item => {
    for (const field of ['chart', 'table', 'markdown', 'input']) {
      const val = item[field];
      if (val) {
        const objName = parseRefValue(val);
        return `${field}:${objName}`;
      }
    }
    return '';
  };

  /**
   * Get the object type of the currently selected item (for icon display)
   */
  const getSelectedType = item => {
    for (const field of ['chart', 'table', 'markdown', 'input']) {
      if (item[field]) return field;
    }
    return null;
  };

  /**
   * Handle object selection from the dropdown
   */
  const handleObjectSelect = (rowIndex, itemIndex, combinedValue) => {
    const updated = [...rows];
    const item = {
      ...updated[rowIndex].items[itemIndex],
      chart: '',
      table: '',
      markdown: '',
      selector: '',
      input: '',
    };

    if (combinedValue) {
      const colonIdx = combinedValue.indexOf(':');
      const type = combinedValue.substring(0, colonIdx);
      const objName = combinedValue.substring(colonIdx + 1);
      item[type] = formatRef(objName);
    }

    updated[rowIndex] = {
      ...updated[rowIndex],
      items: updated[rowIndex].items.map((it, i) => (i === itemIndex ? item : it)),
    };
    setRows(updated);
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
          helperText={
            !isCreate && name.trim() !== originalName && name.trim()
              ? `Will rename '${originalName}' on save.`
              : undefined
          }
        />

        {/* Rename confirmation dialog */}
        {renameConfirm && !isCreate && (
          <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-md space-y-2">
            <p className="text-sm text-gray-800">
              Rename <span className="font-semibold">{renameConfirm.oldName}</span> to{' '}
              <span className="font-semibold">{renameConfirm.newName}</span>?
            </p>
            <p className="text-xs text-gray-600">
              <span data-testid="rename-ref-count-message">
                {renameConfirm.rewrittenRefCount > 0
                  ? `This will also update ${renameConfirm.rewrittenRefCount} reference${
                      renameConfirm.rewrittenRefCount === 1 ? '' : 's'
                    } in your project.`
                  : 'No other objects reference this dashboard, so no other files will change.'}
              </span>{' '}
              You will need to publish to flush the rename to YAML.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="rename-cancel-button"
                onClick={handleRenameCancel}
                disabled={renaming}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel Rename
              </button>
              <button
                type="button"
                data-testid="rename-confirm-button"
                onClick={handleRenameConfirm}
                disabled={renaming}
                className="px-3 py-1 text-sm text-white bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                {renaming ? 'Renaming...' : 'Confirm Rename'}
              </button>
            </div>
          </div>
        )}

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
                    {row.items.map((item, itemIndex) => {
                      const selectedType = getSelectedType(item);
                      const typeConfig = selectedType ? getTypeByValue(selectedType) : null;
                      const ItemIcon = typeConfig?.icon || DashboardIcon;
                      const iconColor = typeConfig?.colors?.text || 'text-gray-400';

                      return (
                        <div key={itemIndex} className="p-2 bg-white border border-gray-200 rounded space-y-2">
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
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Width:</label>
                            <input
                              type="number"
                              min="1"
                              value={item.width}
                              onChange={e => updateItemWidth(rowIndex, itemIndex, e.target.value)}
                              className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="relative">
                            <select
                              value={getSelectedValue(item)}
                              onChange={e => handleObjectSelect(rowIndex, itemIndex, e.target.value)}
                              className="block w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                              <option value="">Select object...</option>
                              {availableObjects.map(group => (
                                <optgroup key={group.type} label={group.label}>
                                  {group.items.map(objName => (
                                    <option key={`${group.type}:${objName}`} value={`${group.type}:${objName}`}>
                                      {objName}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                              <ItemIcon style={{ fontSize: 16 }} className={iconColor} />
                            </div>
                            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                              <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
