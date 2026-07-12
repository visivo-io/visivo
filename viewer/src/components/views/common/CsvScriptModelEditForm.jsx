import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';
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
 *
 * VIS-1018: in EDIT mode each field change debounce-persists through the unified
 * `useRecordSave('csvScriptModel', …)` backbone, which writes the config into the
 * record store optimistically and only persists if it passes schema validation
 * (otherwise it reports status:'invalid' with per-field gate errors and persists
 * nothing). There is no Save button in edit mode — a save-state indicator
 * replaces it. CREATE mode keeps its explicit Save button (the record isn't in
 * the store yet, so there is nothing to optimistically update).
 */
const CsvScriptModelEditForm = ({ model, isCreate, onSave, onClose }) => {
  const deleteCsvScriptModel = useStore(state => state.deleteCsvScriptModel);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);

  const isEditMode = !!model && !isCreate;
  const isAutoSave = isEditMode;

  const [name, setName] = useState('');
  const [tableName, setTableName] = useState('model');
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [args, setArgs] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Set true once the form has hydrated from `model`, so the auto-save effect
  // below never fires on hydration (only on real user edits). Keyed on the
  // record NAME (not identity), so an optimistic-save refetch doesn't re-hydrate
  // and clobber in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = false;
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
    // Defer past the state-set renders so their auto-save effect runs while
    // still un-hydrated (mirrors ModelEditForm).
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.name, isCreate]);

  // Build the config from the current form state (shared by manual create-mode
  // save and the debounced auto-save path).
  const buildConfig = useCallback(() => {
    const config = {
      name: name.trim(),
      table_name: tableName.trim() || 'model',
      args: args.filter(a => a.trim()),
    };
    if (allowEmpty) config.allow_empty = true;
    return config;
  }, [name, tableName, allowEmpty, args]);

  // Unified optimistic + debounced + schema-validated save backbone (VIS-1018).
  // scheduleSave writes the config optimistically into the model store, then
  // debounce-persists ONLY if it passes schema validation; otherwise it reports
  // status:'invalid' with per-field gate errors and persists nothing.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('csvScriptModel', model?.name || null);

  const gateErrorText =
    gateErrors && gateErrors.length > 0
      ? gateErrors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ')
      : null;

  // Auto-save: whenever an editable field changes (post-hydration), schedule a
  // save once the local minimums (name + at least one non-blank arg) are
  // present. The schema gate in scheduleSave still decides whether it persists.
  useEffect(() => {
    if (!isAutoSave || !hydratedRef.current) return;
    if (!name.trim() || !args.some(a => a.trim())) return;
    scheduleSave(buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, tableName, allowEmpty, args]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const config = buildConfig();

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
        await checkCommitStatus();
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
        {gateErrorText && (
          <div data-testid="csvScriptModel-gate-errors">
            <FormAlert variant="error">{gateErrorText}</FormAlert>
          </div>
        )}

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
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                : 'Are you sure? This will mark it for deletion on commit.'}
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

          {/* Edit mode auto-saves on every valid change through the unified
              backbone, so the footer shows a save-state indicator instead of a
              Save button. Create keeps the explicit Cancel/Save. */}
          {isAutoSave ? (
            <div className="flex items-center gap-2" data-testid="form-footer-autosave">
              <SaveStateIndicator status={autoSaveStatus} />
            </div>
          ) : (
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
          )}
        </div>
      </form>
    </div>
  );
};

export default CsvScriptModelEditForm;
