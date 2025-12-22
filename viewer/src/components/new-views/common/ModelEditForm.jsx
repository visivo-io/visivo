import React, { useState, useEffect } from 'react';
import useStore from '../../../stores/store';
import SourceSelector from './SourceSelector';

/**
 * ModelEditForm - Form for creating/editing SqlModel
 *
 * Props:
 * - model: Existing model to edit (null for create mode)
 * - onSave: Callback after successful save
 * - onCancel: Callback to cancel editing
 */
const ModelEditForm = ({ model, onSave, onCancel }) => {
  const saveModel = useStore(state => state.saveModel);
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);

  const isCreate = !model;

  // Form state
  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Initialize form with model data
  useEffect(() => {
    if (model) {
      setName(model.name || '');
      setSql(model.sql || model.config?.sql || '');
      setSource(model.source || model.config?.source || null);
    } else {
      setName('');
      setSql('');
      setSource(null);
    }
  }, [model]);

  // Fetch sources on mount if not loaded
  useEffect(() => {
    if (sources.length === 0) {
      fetchSources();
    }
  }, [sources.length, fetchSources]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Build config object
    const config = {
      name: name.trim(),
      sql: sql.trim(),
    };

    // Add source reference if selected
    if (source) {
      config.source = `ref(${source})`;
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

  const isValid = name.trim() && sql.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Name field */}
      <div className="space-y-1">
        <label htmlFor="model-name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="model-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!isCreate} // Can't rename existing model
          placeholder="my_model"
          className={`
            block w-full px-3 py-2 text-sm
            border border-gray-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
          `}
        />
        {!isCreate && (
          <p className="text-xs text-gray-500">Model names cannot be changed after creation.</p>
        )}
      </div>

      {/* SQL field */}
      <div className="space-y-1">
        <label htmlFor="model-sql" className="block text-sm font-medium text-gray-700">
          SQL Query
        </label>
        <textarea
          id="model-sql"
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="SELECT * FROM table_name"
          rows={8}
          className={`
            block w-full px-3 py-2 text-sm font-mono
            border border-gray-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            resize-y
          `}
        />
        <p className="text-xs text-gray-500">
          Write the SQL query that will generate your model's data.
        </p>
      </div>

      {/* Source selector */}
      <SourceSelector value={source} onChange={setSource} sources={sources} label="Data Source" />

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`
            px-4 py-2 text-sm font-medium
            text-gray-700 bg-white border border-gray-300 rounded-md
            hover:bg-gray-50
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || saving}
          className={`
            px-4 py-2 text-sm font-medium
            text-white bg-indigo-600 rounded-md
            hover:bg-indigo-700
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {saving ? 'Saving...' : isCreate ? 'Create Model' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
};

export default ModelEditForm;
