import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../../../stores/store';
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
 */
const LocalMergeModelEditForm = ({ model, isCreate, onSave, onClose }) => {
  const deleteLocalMergeModel = useStore(state => state.deleteLocalMergeModel);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);

  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [modelRefs, setModelRefs] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
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
  }, [model]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Parse ref values to extract plain names
    const parsedModels = modelRefs
      .filter(r => r && r.trim())
      .map(r => {
        const trimmed = r.trim();
        const parsed = parseRefValue(trimmed);
        return parsed || trimmed;
      });

    const config = {
      name: name.trim(),
      sql: sql.trim(),
      models: parsedModels,
    };

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

export default LocalMergeModelEditForm;
