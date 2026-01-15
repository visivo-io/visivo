import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../../../stores/store';
import RefSelector from './RefSelector';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { getTypeByValue } from './objectTypeConfigs';

/**
 * ModelEditForm - Form for creating/editing SqlModel
 *
 * Props:
 * - model: Existing model to edit (null for create mode)
 * - onSave: Callback after successful save
 * - onCancel: Callback to cancel editing
 * - onNavigateToEmbedded: Callback(type, object) to navigate to an embedded object
 */
const ModelEditForm = ({ model, onSave, onCancel, onNavigateToEmbedded }) => {
  const saveModel = useStore(state => state.saveModel);
  const deleteModel = useStore(state => state.deleteModel);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);
  const fetchSources = useStore(state => state.fetchSources);

  const isCreate = !model;

  // Form state
  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [source, setSource] = useState(null); // Stored as ref(name) format
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Check if source is embedded (object) vs referenced (string)
  const hasEmbeddedSource = model?.config?.source && typeof model.config.source === 'object';

  // Initialize form with model data
  useEffect(() => {
    if (model) {
      setName(model.name || '');
      setSql(model.config?.sql || '');
      // Source comes from API - could be ref() string, embedded object, or null
      // Only set source state if it's a string reference, not embedded
      if (typeof model.config?.source === 'string') {
        setSource(model.config.source);
      } else {
        setSource(null);
      }
    } else {
      setName('');
      setSql('');
      setSource(null);
    }
  }, [model]);

  // Fetch sources on mount to populate RefSelector
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Build config object
    const config = {
      name: name.trim(),
      sql: sql.trim(),
    };

    // Preserve embedded source if it exists (use pending changes if available), otherwise use selected ref
    if (hasEmbeddedSource) {
      config.source = model._pendingEmbeddedSource || model.config.source;
    } else if (source) {
      config.source = source;
    }

    try {
      const result = await saveModel(config.name, config);
      if (result.success) {
        onSave && onSave(result);
      } else {
        setError(result.error || 'Failed to save model');
      }
    } catch (err) {
      setError(err.message || 'Failed to save model');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteModel(model.name);
      if (result.success) {
        await checkPublishStatus();
        onCancel();
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

  const isValid = name.trim() && sql.trim();
  const isNewObject = model?.status === 'new';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <FormAlert variant="error">{error}</FormAlert>}

      <FormInput
        id="model-name"
        label="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={!isCreate}
        helperText={!isCreate ? 'Model names cannot be changed after creation.' : undefined}
      />

      {/* SQL field - Monaco Editor doesn't fit the standard form pattern */}
      <div className="space-y-1">
        <label htmlFor="model-sql" className="block text-sm font-medium text-gray-700">
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
          Write the SQL query that will generate your model's data.
        </p>
      </div>

      {/* Show embedded source as clickable link, or RefSelector for selection */}
      {hasEmbeddedSource ? (() => {
        const sourceTypeConfig = getTypeByValue('source');
        const SourceIcon = sourceTypeConfig?.icon;
        const embeddedConfig = model._pendingEmbeddedSource || model.config.source;
        return (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Data Source
            </label>
            <button
              type="button"
              onClick={() => {
                if (onNavigateToEmbedded) {
                  // Create synthetic source object for navigation
                  const syntheticSource = {
                    name: `(embedded in ${model.name})`,
                    status: 'published',
                    child_item_names: [],
                    config: embeddedConfig,
                    _isEmbedded: true,
                    _parentModelName: model.name,
                  };
                  onNavigateToEmbedded('source', syntheticSource);
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${sourceTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${sourceTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
            >
              {SourceIcon && <SourceIcon fontSize="small" className={sourceTypeConfig?.colors?.text || 'text-gray-600'} />}
              <span className={`text-sm font-medium ${sourceTypeConfig?.colors?.text || 'text-gray-700'}`}>
                Source: {embeddedConfig.type || 'embedded'}
              </span>
              {model._pendingEmbeddedSource && (
                <span className="w-2 h-2 bg-amber-500 rounded-full" title="Unsaved changes" />
              )}
              <ChevronRightIcon fontSize="small" className={`ml-auto ${sourceTypeConfig?.colors?.text || 'text-gray-600'}`} />
            </button>
            {embeddedConfig.database && (
              <p className="text-xs text-gray-500 ml-1">
                Database: {embeddedConfig.database}
              </p>
            )}
          </div>
        );
      })() : (
        <RefSelector
          value={source}
          onChange={setSource}
          objectType="source"
          label="Data Source"
          placeholder="No source (use default)"
          helperText="Select a source to run the SQL query against, or leave empty to use the default source."
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && !isCreate && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700 mb-2">
            {isNewObject
              ? 'Are you sure you want to delete this model? This will discard your unsaved changes.'
              : 'Are you sure you want to delete this model? This will mark it for deletion and remove it from YAML when you publish.'}
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

      {/* Action buttons */}
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
          <ButtonOutline
            type="button"
            onClick={onCancel}
            disabled={saving || deleting}
            className="text-sm"
          >
            Cancel
          </ButtonOutline>
          <Button
            type="submit"
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
  );
};

export default ModelEditForm;
