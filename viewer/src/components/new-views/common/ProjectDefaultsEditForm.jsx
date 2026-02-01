import React, { useState, useEffect } from 'react';
import useStore from '../../../stores/store';
import RefSelector from './RefSelector';
import { parseRefValue, formatRef } from '../../../utils/refString';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

/**
 * ProjectDefaultsEditForm - Form for editing project-level defaults (singleton)
 *
 * Fields: source_name, alert_name, threads, telemetry_enabled, levels
 */
const ProjectDefaultsEditForm = ({ defaults, onSave, onClose }) => {
  const saveDefaults = useStore(state => state.saveDefaults);
  const fetchSources = useStore(state => state.fetchSources);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);

  const [sourceName, setSourceName] = useState('');
  const [alertName, setAlertName] = useState('');
  const [threads, setThreads] = useState(8);
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [levels, setLevels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    if (defaults) {
      setSourceName(defaults.source_name || '');
      setAlertName(defaults.alert_name || '');
      setThreads(defaults.threads ?? 8);
      setTelemetryEnabled(defaults.telemetry_enabled ?? true);
      setLevels(defaults.levels || []);
    }
  }, [defaults]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const config = {};
    if (sourceName) config.source_name = sourceName;
    if (alertName) config.alert_name = alertName;
    if (threads !== null && threads !== undefined) config.threads = Number(threads);
    if (telemetryEnabled !== null && telemetryEnabled !== undefined)
      config.telemetry_enabled = telemetryEnabled;
    if (levels.length > 0)
      config.levels = levels.filter(l => l.title && l.description);

    try {
      const result = await saveDefaults(config);
      if (result?.success) {
        if (checkPublishStatus) await checkPublishStatus();
        if (onClose) onClose();
      } else {
        setError(result?.error || 'Failed to save defaults');
      }
    } catch (err) {
      setError(err.message || 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  const addLevel = () => {
    setLevels([...levels, { title: '', description: '' }]);
  };

  const removeLevel = index => {
    setLevels(levels.filter((_, i) => i !== index));
  };

  const updateLevel = (index, field, value) => {
    const updated = [...levels];
    updated[index] = { ...updated[index], [field]: value };
    setLevels(updated);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormAlert variant="error">{error}</FormAlert>}

        <RefSelector
          value={sourceName ? formatRef(sourceName) : null}
          onChange={val => {
            if (val) {
              setSourceName(parseRefValue(val) || '');
            } else {
              setSourceName('');
            }
          }}
          objectType="source"
          label="Default Source"
          placeholder="No default source"
          helperText="The default source used when none is specified on a model."
        />

        <FormInput
          id="defaults-alert"
          label="Default Alert Name"
          value={alertName}
          onChange={e => setAlertName(e.target.value)}
          placeholder="e.g. slack"
          helperText="The default alert to use for test failures."
        />

        <FormInput
          id="defaults-threads"
          label="Threads"
          type="number"
          value={threads}
          onChange={e => setThreads(e.target.value)}
          helperText="Number of threads to use when running queries."
        />

        <div className="flex items-center gap-2">
          <input
            id="defaults-telemetry"
            type="checkbox"
            checked={telemetryEnabled}
            onChange={e => setTelemetryEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="defaults-telemetry" className="text-sm font-medium text-gray-700">
            Telemetry Enabled
          </label>
        </div>

        {/* Levels section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Dashboard Levels</label>
            <button
              type="button"
              onClick={addLevel}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              <AddIcon fontSize="small" />
              Add Level
            </button>
          </div>
          {levels.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No dashboard levels defined.</p>
          ) : (
            <div className="space-y-2">
              {levels.map((level, index) => (
                <div key={index} className="p-2 bg-gray-50 border border-gray-200 rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Level {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLevel(index)}
                      className="p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={level.title}
                    onChange={e => updateLevel(index, 'title', e.target.value)}
                    placeholder="Title"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={level.description}
                    onChange={e => updateLevel(index, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <ButtonOutline type="button" onClick={onClose} disabled={saving} className="text-sm">
            Cancel
          </ButtonOutline>
          <Button type="submit" disabled={saving} className="text-sm">
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
      </form>
    </div>
  );
};

export default ProjectDefaultsEditForm;
