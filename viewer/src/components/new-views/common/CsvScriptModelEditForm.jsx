import React, { useState, useEffect } from 'react';
import useStore from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

/**
 * CsvScriptModelEditForm - Form for creating/editing CsvScriptModel
 *
 * Fields: name, table_name, allow_empty, args (list of strings)
 */
const CsvScriptModelEditForm = ({ model, isCreate, onSave, onClose }) => {
  const deleteCsvScriptModel = useStore(state => state.deleteCsvScriptModel);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);

  const [name, setName] = useState('');
  const [tableName, setTableName] = useState('model');
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [args, setArgs] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (model) {
      setName(model.name || '');
      setTableName(model.config?.table_name || 'model');
      setAllowEmpty(model.config?.allow_empty || false);
      setArgs(model.config?.args?.length ? model.config.args : ['']);
    } else {
      setName('');
      setTableName('model');
      setAllowEmpty(false);
      setArgs(['']);
    }
  }, [model]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const config = {
      name: name.trim(),
      table_name: tableName.trim() || 'model',
      args: args.filter(a => a.trim()),
    };

    if (allowEmpty) config.allow_empty = true;

    const result = await onSave('csvScriptModel', config.name, config);
    setSaving(false);

    if (!result?.success) {
      setError(result?.error || 'Failed to save CSV script model');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteCsvScriptModel(model.name);
      if (result.success) {
        await checkPublishStatus();
        onClose();
      } else {
        setError(result.error || 'Failed to delete model');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete model');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const addArg = () => setArgs([...args, '']);
  const removeArg = index => setArgs(args.filter((_, i) => i !== index));
  const updateArg = (index, value) => {
    const updated = [...args];
    updated[index] = value;
    setArgs(updated);
  };

  const isValid = name.trim() && args.some(a => a.trim());
  const isNewObject = model?.status === 'new';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormAlert variant="error">{error}</FormAlert>}

        <FormInput
          id="csv-model-name"
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!isCreate}
          helperText={!isCreate ? 'Names cannot be changed after creation.' : undefined}
        />

        <FormInput
          id="csv-model-table-name"
          label="Table Name"
          value={tableName}
          onChange={e => setTableName(e.target.value)}
          placeholder="model"
          helperText="The name of the resulting table in DuckDB."
        />

        <div className="flex items-center gap-2">
          <input
            id="csv-model-allow-empty"
            type="checkbox"
            checked={allowEmpty}
            onChange={e => setAllowEmpty(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="csv-model-allow-empty" className="text-sm font-medium text-gray-700">
            Allow Empty Output
          </label>
        </div>

        {/* Args list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Command Arguments</label>
            <button
              type="button"
              onClick={addArg}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Command arguments that will be executed. The command must output valid CSV to stdout.
          </p>
          <div className="space-y-1">
            {args.map((arg, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={arg}
                  onChange={e => updateArg(index, e.target.value)}
                  placeholder={index === 0 ? 'command (e.g. cat, python)' : 'argument'}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {args.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArg(index)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <RemoveIcon fontSize="small" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && !isCreate && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure? This will discard your unsaved changes.'
                : 'Are you sure? This will mark it for deletion on publish.'}
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
                title="Delete model"
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

export default CsvScriptModelEditForm;
