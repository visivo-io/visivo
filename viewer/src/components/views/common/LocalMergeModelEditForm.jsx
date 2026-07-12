import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';
import RefSelector from './RefSelector';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { parseRefValue } from '../../../utils/refString';

/**
 * LocalMergeModelEditForm - Form for creating/editing LocalMergeModel
 *
 * Fields: name, sql (Monaco editor), models (list of ref selectors)
 *
 * Edit mode auto-saves through the unified backbone (VIS-1018): every editable
 * field change debounce-persists via `useRecordSave('localMergeModel', …)` ONLY
 * if the config passes schema validation, so the footer shows a save-state
 * indicator instead of a Save button. Create mode keeps the explicit Save button
 * (the record isn't in the store collection yet).
 */
const LocalMergeModelEditForm = ({ model, isCreate, onSave, onClose }) => {
  const deleteLocalMergeModel = useStore(state => state.deleteLocalMergeModel);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);

  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [modelRefs, setModelRefs] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!model && !isCreate;
  const isAutoSave = isEditMode;

  // Unified optimistic + debounced + schema-validated save backbone (VIS-1018).
  // scheduleSave writes the config optimistically into the store, then
  // debounce-persists ONLY if it passes schema validation; otherwise it reports
  // status:'invalid' with per-field gate errors and persists nothing.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('localMergeModel', model?.name || null);

  const gateErrorText =
    gateErrors && gateErrors.length > 0
      ? gateErrors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ')
      : null;

  // Build the config from current form state (shared by the create-mode manual
  // save and the debounced auto-save path) — identical shape to the config the
  // manual `onSave('localMergeModel', config.name, config)` sends.
  const buildConfig = () => {
    const parsedModels = modelRefs
      .filter(r => r && r.trim())
      .map(r => {
        const trimmed = r.trim();
        const parsed = parseRefValue(trimmed);
        return parsed || trimmed;
      });
    return {
      name: name.trim(),
      sql: sql.trim(),
      models: parsedModels,
    };
  };

  // Set true once the form has hydrated from `model`, so the auto-save effect
  // below never fires on hydration (only on real user edits). Keyed on the model
  // NAME (not identity), so an optimistic-save refetch doesn't re-hydrate and
  // clobber in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = false;
    if (model) {
      setName(model.name || '');
      setSql(model.config?.sql || '');
      // Parse ref values to extract plain names for RefSelector
      const refs = (model.config?.models || [])
        .map(ref => {
          // Trim the ref string first to remove any whitespace
          const trimmed = typeof ref === 'string' ? ref.trim() : ref;
          // Then parse to extract the name
          const parsed = parseRefValue(trimmed);
          // Return the parsed value or the trimmed original
          return parsed || trimmed;
        })
        .filter(ref => ref); // Remove any empty values
      setModelRefs(refs.length > 0 ? refs : ['']);
    } else {
      setName('');
      setSql('');
      setModelRefs(['']);
    }
    // Defer past the state-set renders so their auto-save effect runs while
    // still un-hydrated (mirrors ModelEditForm).
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.name, isCreate]);

  // Auto-save: whenever an editable field changes (post-hydration), schedule a
  // save once the local minimums (name, sql, at least one model ref) are
  // present. The schema gate in scheduleSave still decides whether it persists.
  useEffect(() => {
    if (!isAutoSave || !hydratedRef.current) return;
    if (!name.trim() || !sql.trim() || !modelRefs.some(r => r.trim())) return;
    scheduleSave(buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, sql, modelRefs]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const config = buildConfig();

    const result = await onSave('localMergeModel', config.name, config);
    setSaving(false);

    if (!result?.success) {
      setError(result?.error || 'Failed to save local merge model');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteLocalMergeModel(model.name);
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

  const addModelRef = () => setModelRefs([...modelRefs, '']);
  const removeModelRef = index => setModelRefs(modelRefs.filter((_, i) => i !== index));
  const updateModelRef = (index, value) => {
    const updated = [...modelRefs];
    updated[index] = value;
    setModelRefs(updated);
  };

  const isValid = name.trim() && sql.trim() && modelRefs.some(r => r.trim());
  const isNewObject = model?.status === 'new';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormAlert variant="error">{error}</FormAlert>}
        {gateErrorText && (
          <div data-testid="localMergeModel-gate-errors">
            <FormAlert variant="error">{gateErrorText}</FormAlert>
          </div>
        )}

        <FormInput
          id="merge-model-name"
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!isCreate}
          helperText={!isCreate ? 'Names cannot be changed after creation.' : undefined}
        />

        {/* SQL field */}
        <div className="space-y-1">
          <label htmlFor="merge-model-sql" className="block text-sm font-medium text-gray-700">
            SQL Query
          </label>
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <Editor
              height={Math.max(160, (sql.split('\n').length + 1) * 19)}
              language="sql"
              theme="vs-dark"
              value={sql}
              onChange={value => setSql(value || '')}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                automaticLayout: true,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12, left: 8, right: 8 },
                lineNumbers: 'on',
                glyphMargin: false,
                folding: false,
                lineDecorationsWidth: 12,
                lineNumbersMinChars: 3,
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'auto',
                },
              }}
            />
          </div>
          <p className="text-xs text-gray-500">
            SQL to merge data from the models below. Reference models as schema_name.table_name.
          </p>
        </div>

        {/* Model refs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Models to Merge</label>
            <button
              type="button"
              onClick={addModelRef}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500">
            References to models whose data will be available for merging.
          </p>
          <div className="space-y-2">
            {modelRefs.map((ref, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <RefSelector
                    value={ref || null}
                    onChange={val => updateModelRef(index, val || '')}
                    objectType="model"
                    placeholder="Select a model..."
                  />
                </div>
                {modelRefs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeModelRef(index)}
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

export default LocalMergeModelEditForm;
