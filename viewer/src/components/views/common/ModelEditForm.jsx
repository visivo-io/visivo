import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../../../stores/store';
import RefSelector from './RefSelector';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { getTypeByValue } from './objectTypeConfigs';
import InlineFieldEditor from './InlineFieldEditor';

/**
 * ModelEditForm - Form for creating/editing SqlModel
 *
 * Props:
 * - model: Existing model to edit (null for create mode)
 * - onSave: Callback after successful save
 * - onCancel: Callback to cancel editing
 * - onNavigateToEmbedded: Callback(type, object, options) to navigate to an embedded object
 *   options.applyToParent: (parentConfig, embeddedConfig) => newParentConfig
 */
const ModelEditForm = ({ model, onSave, onCancel, onNavigateToEmbedded }) => {
  // Which inline row is open for editing (null = none). These used to be links
  // into a separate editor that nothing ever wired up, so the fields had no way
  // to be filled in.
  const [expandedDimension, setExpandedDimension] = useState(null);
  const [expandedMetric, setExpandedMetric] = useState(null);
  const deleteModel = useStore(state => state.deleteModel);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);
  const fetchSources = useStore(state => state.fetchSources);

  const isCreate = !model;

  // Form state
  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [source, setSource] = useState(null); // Stored as ref(name) format
  const [dimensions, setDimensions] = useState([]); // Inline dimensions
  const [metrics, setMetrics] = useState([]); // Inline metrics
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
      // Initialize inline dimensions and metrics
      setDimensions(model.config?.dimensions || []);
      setMetrics(model.config?.metrics || []);
    } else {
      setName('');
      setSql('');
      setSource(null);
      setDimensions([]);
      setMetrics([]);
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

    // Preserve embedded source if it exists, otherwise use selected ref
    if (hasEmbeddedSource) {
      config.source = model.config.source;
    } else if (source) {
      config.source = source;
    }

    // Include inline dimensions and metrics from state. An entirely blank row
    // is an "Add" the user never filled in — persisting it would write
    // `{name: '', expression: ''}`, which fails validation on the way back.
    // A partially-filled row IS kept, so the error names the real problem.
    const isBlank = field => !field?.name?.trim() && !field?.expression?.trim();
    const filledDimensions = dimensions.filter(d => !isBlank(d));
    const filledMetrics = metrics.filter(m => !isBlank(m));
    if (filledDimensions.length > 0) {
      config.dimensions = filledDimensions;
    }
    if (filledMetrics.length > 0) {
      config.metrics = filledMetrics;
    }

    // Call unified save - parent handles routing and panel close
    const result = await onSave('model', config.name, config);

    setSaving(false);

    if (!result?.success) {
      setError(result?.error || 'Failed to save model');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteModel(model.name);
      if (result.success) {
        await checkCommitStatus();
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
        const embeddedConfig = model.config.source;
        return (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Data Source
            </label>
            <button
              type="button"
              onClick={() => {
                if (onNavigateToEmbedded) {
                  // Create synthetic source with embedded marker
                  const syntheticSource = {
                    name: `(embedded in ${model.name})`,
                    config: embeddedConfig,
                    _embedded: { parentType: 'model', parentName: model.name, path: 'source' },
                  };
                  // Navigate with applyToParent to update model's source on save
                  onNavigateToEmbedded('source', syntheticSource, {
                    applyToParent: (parentConfig, newSourceConfig) => ({
                      ...parentConfig,
                      source: newSourceConfig,
                    }),
                  });
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${sourceTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${sourceTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
            >
              {SourceIcon && <SourceIcon fontSize="small" className={sourceTypeConfig?.colors?.text || 'text-gray-600'} />}
              <span className={`text-sm font-medium ${sourceTypeConfig?.colors?.text || 'text-gray-700'}`}>
                Source: {embeddedConfig.type || 'embedded'}
              </span>
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

      {/* Inline Dimensions Section */}
      {!isCreate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Inline Dimensions
            </label>
            <button
              type="button"
              onClick={() => {
                const newIndex = dimensions.length;
                setDimensions([...dimensions, { name: '', expression: '' }]);
                // Open it straight away — an unopened row has an empty name and
                // expression, which is neither valid nor editable.
                setExpandedDimension(newIndex);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add
            </button>
          </div>
          {dimensions.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No inline dimensions defined.</p>
          ) : (
            <div className="space-y-1">
              {dimensions.map((dim, index) => {
                const dimTypeConfig = getTypeByValue('dimension');
                const DimIcon = dimTypeConfig?.icon;
                return (
                  <div key={index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDimension(expandedDimension === index ? null : index)
                      }
                      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md border transition-colors text-left ${dimTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${dimTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
                    >
                      {DimIcon && <DimIcon fontSize="small" className={dimTypeConfig?.colors?.text || 'text-gray-600'} />}
                      <span className={`text-sm font-medium truncate ${dimTypeConfig?.colors?.text || 'text-gray-700'}`}>
                        {dim.name || `Dimension ${index + 1}`}
                      </span>
                      <ChevronRightIcon fontSize="small" className={`ml-auto flex-shrink-0 ${dimTypeConfig?.colors?.text || 'text-gray-600'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDimensions(dimensions.filter((_, i) => i !== index))}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      title="Remove dimension"
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                  </div>
                  {expandedDimension === index && (
                    <InlineFieldEditor
                      kind="dimension"
                      value={dim}
                      onChange={next =>
                        setDimensions(dimensions.map((d, i) => (i === index ? next : d)))
                      }
                    />
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inline Metrics Section */}
      {!isCreate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Inline Metrics
            </label>
            <button
              type="button"
              onClick={() => {
                const newIndex = metrics.length;
                setMetrics([...metrics, { name: '', expression: '' }]);
                setExpandedMetric(newIndex);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add
            </button>
          </div>
          {metrics.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No inline metrics defined.</p>
          ) : (
            <div className="space-y-1">
              {metrics.map((metric, index) => {
                const metricTypeConfig = getTypeByValue('metric');
                const MetricIcon = metricTypeConfig?.icon;
                return (
                  <div key={index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedMetric(expandedMetric === index ? null : index)}
                      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md border transition-colors text-left ${metricTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${metricTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
                    >
                      {MetricIcon && <MetricIcon fontSize="small" className={metricTypeConfig?.colors?.text || 'text-gray-600'} />}
                      <span className={`text-sm font-medium truncate ${metricTypeConfig?.colors?.text || 'text-gray-700'}`}>
                        {metric.name || `Metric ${index + 1}`}
                      </span>
                      <ChevronRightIcon fontSize="small" className={`ml-auto flex-shrink-0 ${metricTypeConfig?.colors?.text || 'text-gray-600'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetrics(metrics.filter((_, i) => i !== index))}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      title="Remove metric"
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                  </div>
                  {expandedMetric === index && (
                    <InlineFieldEditor
                      kind="metric"
                      value={metric}
                      onChange={next =>
                        setMetrics(metrics.map((m, i) => (i === index ? next : m)))
                      }
                    />
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && !isCreate && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700 mb-2">
            {isNewObject
              ? 'Are you sure you want to delete this model? This will discard your unsaved changes.'
              : 'Are you sure you want to delete this model? This will mark it for deletion and remove it from YAML when you commit.'}
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
  );
};

export default ModelEditForm;
